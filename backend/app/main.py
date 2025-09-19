from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Dict
import uuid
from datetime import datetime

from . import crud, models
from .database import engine, get_db
from passlib.context import CryptContext

# This creates the tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add initial data on first startup
with Session(engine) as db_session:
    crud.add_initial_data(db_session)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Pydantic Models for API data validation ---

# Authentication and Creation
class TeacherCreate(BaseModel): email: EmailStr; password: str; full_name: str
class TeacherLogin(BaseModel): email: EmailStr; password: str
class StudentCreate(BaseModel): student_id_card: str; full_name: str; class_name: str
class StudentLogin(BaseModel): student_id_card: str

# Model for creating tasks dynamically
class TaskCreate(BaseModel):
    title: str
    description: str
    points_reward: int
    task_type: str # 'photo_upload' or 'secret_code'

# Submissions
class QuizSubmission(BaseModel): answers: Dict[str, str]

# Responses
class BadgeResponse(BaseModel):
    name: str
    description: str
    icon_url: str
    class Config: orm_mode = True

class StudentProfileResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    points: int
    badges: List[BadgeResponse]
    class Config: orm_mode = True

class StudentForTeacherResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    class_name: str
    points: int
    class Config: orm_mode = True

class QuizQuestionResponse(BaseModel):
    id: uuid.UUID
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    class Config: orm_mode = True

class EcoTaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    points_reward: int
    task_type: str
    questions: List[QuizQuestionResponse] = []
    class Config: orm_mode = True

class SubmissionForTeacherResponse(BaseModel):
    id: uuid.UUID
    student_name: str
    task_title: str
    submission_data: str
    submitted_at: datetime
    class Config: orm_mode = True

# Model for a student's submission history
class SubmissionHistoryResponse(BaseModel):
    task_title: str
    status: str
    submitted_at: datetime
    class Config: orm_mode = True

# --- Teacher Registration and Login ---
@app.post("/api/teacher/register", status_code=status.HTTP_201_CREATED)
def register_teacher(teacher: TeacherCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=teacher.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = pwd_context.hash(teacher.password)
    new_teacher = crud.create_teacher(db=db, email=teacher.email, password_hash=hashed_password, full_name=teacher.full_name)
    return {"message": "Teacher registered successfully", "teacher_id": new_teacher.id, "email": new_teacher.email}

@app.post("/api/teacher/login")
def login_teacher(form_data: TeacherLogin, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=form_data.email)
    if not user or not pwd_context.verify(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"message": "Login successful", "teacher_id": user.id, "full_name": user.full_name}

# --- Student Login and Management ---
@app.post("/api/student/login")
def login_student(form_data: StudentLogin, db: Session = Depends(get_db)):
    student = crud.get_student_by_id_card(db, student_id_card=form_data.student_id_card)
    if not student:
        raise HTTPException(status_code=404, detail="Student ID not found.")
    return {"message": "Login successful", "student_id": str(student.id), "full_name": student.full_name}
    
@app.post("/api/teacher/{teacher_id}/add-student")
def add_student_by_teacher(teacher_id: uuid.UUID, student: StudentCreate, db: Session = Depends(get_db)):
    db_student = crud.get_student_by_id_card(db, student_id_card=student.student_id_card)
    if db_student:
        raise HTTPException(status_code=400, detail="A student with this ID card is already registered.")
    new_student = crud.create_student(
        db=db, student_id_card=student.student_id_card, full_name=student.full_name,
        class_name=student.class_name, teacher_id=teacher_id
    )
    return new_student

@app.get("/api/teacher/{teacher_id}/roster", response_model=List[StudentForTeacherResponse])
def get_teacher_roster(teacher_id: uuid.UUID, db: Session = Depends(get_db)):
    """Gets a list of all students registered by a specific teacher."""
    students = crud.get_students_by_teacher(db, teacher_id=teacher_id)
    return students

# --- Task and Profile Routes ---
@app.get("/api/tasks", response_model=List[EcoTaskResponse])
def get_all_tasks(db: Session = Depends(get_db)):
    return crud.get_all_tasks(db)

@app.post("/api/tasks", status_code=status.HTTP_201_CREATED, response_model=EcoTaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    new_task = crud.create_eco_task(
        db=db, title=task.title, description=task.description,
        points_reward=task.points_reward, task_type=task.task_type
    )
    return new_task

@app.get("/api/student/{student_id}/profile", response_model=StudentProfileResponse)
def get_student_profile(student_id: uuid.UUID, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id=student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student

# --- Submission Routes ---
@app.post("/api/student/{student_id}/submit/photo/{task_id}")
def submit_photo_task(student_id: uuid.UUID, task_id: uuid.UUID, db: Session = Depends(get_db)):
    crud.create_submission(db, student_id, task_id, "Photo awaiting review", "pending")
    return {"message": "Submission received and awaiting teacher approval."}

@app.post("/api/student/{student_id}/submit/quiz/{task_id}")
def submit_quiz_task(student_id: uuid.UUID, task_id: uuid.UUID, submission: QuizSubmission, db: Session = Depends(get_db)):
    task = crud.get_task_by_id(db, task_id)
    student = crud.get_student_by_id(db, student_id)
    
    score = 0
    total_questions = len(task.questions)
    for q in task.questions:
        if submission.answers.get(str(q.id)) == q.correct_answer:
            score += 1

    if score == total_questions:
        student.points += task.points_reward
        status = 'approved'
        badge = crud.get_badge_by_name(db, "Quiz Whiz")
        if badge: crud.award_badge_to_student(db, student, badge)
        first_steps_badge = crud.get_badge_by_name(db, "First Steps")
        if first_steps_badge: crud.award_badge_to_student(db, student, first_steps_badge)
    else:
        status = 'rejected'

    crud.create_submission(db, student_id, task_id, f"Score: {score}/{total_questions}", status)
    db.commit()
    return {"message": f"Quiz submitted! You scored {score}/{total_questions}.", "status": status}

@app.get("/api/student/{student_id}/submissions", response_model=List[SubmissionHistoryResponse])
def get_student_submission_history(student_id: uuid.UUID, db: Session = Depends(get_db)):
    submissions = crud.get_submissions_by_student(db, student_id=student_id)
    return submissions

@app.get("/api/teacher/{teacher_id}/submissions", response_model=List[SubmissionForTeacherResponse])
def get_pending_submissions(teacher_id: uuid.UUID, db: Session = Depends(get_db)):
    submissions = crud.get_pending_submissions_by_teacher(db, teacher_id)
    response = [
        SubmissionForTeacherResponse(
            id=s.id, student_name=s.student.full_name, task_title=s.task.title,
            submission_data=s.submission_data, submitted_at=s.submitted_at
        ) for s in submissions
    ]
    return response

@app.post("/api/teacher/submissions/{submission_id}/approve")
def approve_submission(submission_id: uuid.UUID, db: Session = Depends(get_db)):
    submission = crud.get_submission_by_id(db, submission_id)
    if not submission or submission.status != 'pending':
        raise HTTPException(status_code=404, detail="Submission not found or already processed.")
    
    submission.status = 'approved'
    submission.student.points += submission.task.points_reward
    
    eco_warrior_badge = crud.get_badge_by_name(db, "Eco Warrior")
    if eco_warrior_badge: crud.award_badge_to_student(db, submission.student, eco_warrior_badge)
    first_steps_badge = crud.get_badge_by_name(db, "First Steps")
    if first_steps_badge: crud.award_badge_to_student(db, submission.student, first_steps_badge)
        
    db.commit()
    return {"message": "Submission approved and points awarded."}

@app.post("/api/teacher/submissions/{submission_id}/reject")
def reject_submission(submission_id: uuid.UUID, db: Session = Depends(get_db)):
    submission = crud.get_submission_by_id(db, submission_id)
    if not submission or submission.status != 'pending':
        raise HTTPException(status_code=404, detail="Submission not found or already processed.")
    submission.status = 'rejected'
    db.commit()
    return {"message": "Submission rejected."}

# --- Gamification Routes ---
@app.get("/api/leaderboard", response_model=List[StudentProfileResponse])
def get_leaderboard(db: Session = Depends(get_db)):
    return crud.get_leaderboard(db)