from sqlalchemy.orm import Session
from . import models
import uuid

# --- User and Student Functions ---
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_teacher(db: Session, email: str, password_hash: str, full_name: str):
    db_user = models.User(email=email, password=password_hash, full_name=full_name)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_student_by_id(db: Session, student_id: uuid.UUID):
    return db.query(models.Student).filter(models.Student.id == student_id).first()

def get_student_by_id_card(db: Session, student_id_card: str):
    return db.query(models.Student).filter(models.Student.student_id_card == student_id_card).first()

def create_student(db: Session, student_id_card: str, full_name: str, class_name: str, teacher_id: uuid.UUID):
    db_student = models.Student(
        student_id_card=student_id_card,
        full_name=full_name,
        class_name=class_name,
        teacher_id=teacher_id
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return db_student

def get_students_by_teacher(db: Session, teacher_id: uuid.UUID):
    return db.query(models.Student).filter(models.Student.teacher_id == teacher_id).all()


# --- Task, Submission, and Gamification Functions ---
def get_all_tasks(db: Session):
    return db.query(models.EcoTask).all()

def get_task_by_id(db: Session, task_id: uuid.UUID):
    return db.query(models.EcoTask).filter(models.EcoTask.id == task_id).first()

def create_submission(db: Session, student_id: uuid.UUID, task_id: uuid.UUID, data: str, status: str):
    submission = models.StudentSubmission(student_id=student_id, task_id=task_id, submission_data=data, status=status)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission

def get_pending_submissions_by_teacher(db: Session, teacher_id: uuid.UUID):
    return db.query(models.StudentSubmission).join(models.Student).filter(
        models.Student.teacher_id == teacher_id,
        models.StudentSubmission.status == 'pending'
    ).all()

def get_submission_by_id(db: Session, submission_id: uuid.UUID):
    return db.query(models.StudentSubmission).filter(models.StudentSubmission.id == submission_id).first()

def get_badge_by_name(db: Session, name: str):
    return db.query(models.Badge).filter(models.Badge.name == name).first()

def award_badge_to_student(db: Session, student: models.Student, badge: models.Badge):
    if badge not in student.badges:
        student.badges.append(badge)
        db.commit()

def get_leaderboard(db: Session, limit: int = 10):
    return db.query(models.Student).order_by(models.Student.points.desc()).limit(limit).all()


# --- Function to add default content ---
def add_initial_data(db: Session):
    if not db.query(models.Badge).count():
        b1 = models.Badge(name="First Steps", description="Complete your first task!", icon_url="🦶")
        b2 = models.Badge(name="Eco Warrior", description="Get your first photo submission approved!", icon_url="🛡️")
        b3 = models.Badge(name="Quiz Whiz", description="Ace your first quiz!", icon_url="🧠")
        db.add_all([b1, b2, b3])
        db.commit()

    if not db.query(models.EcoTask).count():
        t1 = models.EcoTask(title="Waste Segregation Champion", description="Upload a photo of your segregated wet and dry waste bins at home.", points_reward=50, task_type="photo_upload")
        t2 = models.EcoTask(title="Tree Planting Hero", description="Plant a sapling in your neighborhood and upload a geotagged photo.", points_reward=100, task_type="photo_upload")
        t3 = models.EcoTask(title="Water Saver Quiz", description="Answer these questions about water conservation.", points_reward=25, task_type="quiz")
        db.add_all([t1, t2, t3])
        db.commit()

        q1 = models.QuizQuestion(task_id=t3.id, question_text="How much of Earth's water is fresh water?", option_a="10%", option_b="3%", option_c="30%", correct_answer="B")
        q2 = models.QuizQuestion(task_id=t3.id, question_text="What is the best way to save water at home?", option_a="Take shorter showers", option_b="Only wash full loads of laundry", option_c="Both A and B", correct_answer="C")
        db.add_all([q1, q2])
        db.commit()