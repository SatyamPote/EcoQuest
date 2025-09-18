from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Dict
import uuid

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

# --- Pydantic Models for API data validation (updated) ---
class TeacherCreate(BaseModel): email: EmailStr; password: str; full_name: str
class TeacherLogin(BaseModel): email: EmailStr; password: str
class StudentCreate(BaseModel): student_id_card: str; full_name: str
class StudentLogin(BaseModel): student_id_card: str

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

class QuizSubmission(BaseModel):
    answers: Dict[str, str] # { question_id: "A" }

class SubmissionForTeacherResponse(BaseModel):
    id: uuid.UUID
    student_name: str
    task_title: str
    submission_data: str
    class Config: orm_mode = True


# --- Authentication Routes (from before) ---
@app.post("/api/teacher/login")
def login_teacher(form_data: TeacherLogin, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=form_data.email)
    if not user or not pwd_context.verify(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"message": "Login successful", "teacher_id": user.id, "full_name": user.full_name}

@app.post("/api/student/login")
def login_student(form_data: StudentLogin, db: Session = Depends(get_db)):
    student = crud.get_student_by_id_card(db, student_id_card=form_data.student_id_card)
    if not student:
        raise HTTPException(status_code=404, detail="Student ID not found.")
    return {"message": "Login successful", "student_id": str(student.id), "full_name": student.full_name}
    
@app.post("/api/teacher/{teacher_id}/add-student")
def add_student_by_teacher(teacher_id: uuid.UUID, student: StudentCreate, db: Session = Depends(get_db)):
    new_student = crud.create_student(db=db, student_id_card=student.student_id_card, full_name=student.full_name, teacher_id=teacher_id)
    return new_student

# --- New Feature Routes ---

@app.get("/api/student/{student_id}/profile", response_model=StudentProfileResponse)
def get_student_profile(student_id: uuid.UUID, db: Session = Depends(get_db)):
    student = crud.get_student_by_id(db, student_id=student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student

@app.get("/api/tasks", response_model=List[EcoTaskResponse])
def get_all_tasks(db: Session = Depends(get_db)):
    return crud.get_all_tasks(db)

@app.post("/api/student/{student_id}/submit/photo/{task_id}")
def submit_photo_task(student_id: uuid.UUID, task_id: uuid.UUID, db: Session = Depends(get_db)):
    # In a real app, you would handle a file upload here.
    # For the hackathon, we just create a pending submission.
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

    if score == total_questions: # Full score
        student.points += task.points_reward
        status = 'approved'
        # Award 'Quiz Whiz' badge
        badge = crud.get_badge_by_name(db, "Quiz Whiz")
        if badge: crud.award_badge_to_student(db, student, badge)
        # Award 'First Steps' badge
        first_steps_badge = crud.get_badge_by_name(db, "First Steps")
        if first_steps_badge: crud.award_badge_to_student(db, student, first_steps_badge)

    else:
        status = 'rejected' # Or 'completed' with partial points if you wish

    crud.create_submission(db, student_id, task_id, f"Score: {score}/{total_questions}", status)
    db.commit()
    return {"message": f"Quiz submitted! You scored {score}/{total_questions}.", "status": status}


@app.get("/api/teacher/{teacher_id}/submissions", response_model=List[SubmissionForTeacherResponse])
def get_pending_submissions(teacher_id: uuid.UUID, db: Session = Depends(get_db)):
    submissions = crud.get_pending_submissions_by_teacher(db, teacher_id)
    # Map to response model
    response = [
        SubmissionForTeacherResponse(
            id=s.id,
            student_name=s.student.full_name,
            task_title=s.task.title,
            submission_data=s.submission_data
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
    
    # Award 'Eco Warrior' and 'First Steps' badges
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

@app.get("/api/leaderboard", response_model=List[StudentProfileResponse])
def get_leaderboard(db: Session = Depends(get_db)):
    return crud.get_leaderboard(db)