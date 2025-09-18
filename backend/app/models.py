from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func, UUID as UUID_COLUMN, Table, Boolean
from sqlalchemy.orm import relationship, Mapped
from .database import Base
import uuid

# Association Table for Many-to-Many relationship between Students and Badges
student_badge_association = Table(
    'student_badge_association',
    Base.metadata,
    Column('student_id', UUID_COLUMN(as_uuid=True), ForeignKey('students.id'), primary_key=True),
    Column('badge_id', UUID_COLUMN(as_uuid=True), ForeignKey('badges.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(UUID_COLUMN(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    full_name = Column(String)
    created_at = Column(DateTime, default=func.now())
    students = relationship("Student", back_populates="teacher")

class Student(Base):
    __tablename__ = "students"
    id = Column(UUID_COLUMN(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id_card = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    teacher_id = Column(UUID_COLUMN(as_uuid=True), ForeignKey("users.id"))
    points = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())
    teacher = relationship("User", back_populates="students")
    submissions = relationship("StudentSubmission", back_populates="student")
    badges = relationship("Badge", secondary=student_badge_association, back_populates="students")

class EcoTask(Base):
    __tablename__ = "eco_tasks"
    id = Column(UUID_COLUMN(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(String)
    points_reward = Column(Integer, nullable=False)
    task_type = Column(String, nullable=False) # 'quiz', 'photo_upload', 'ar_scan'
    questions = relationship("QuizQuestion", back_populates="task")

class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    id = Column(UUID_COLUMN(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID_COLUMN(as_uuid=True), ForeignKey("eco_tasks.id"))
    question_text = Column(String, nullable=False)
    option_a = Column(String, nullable=False)
    option_b = Column(String, nullable=False)
    option_c = Column(String, nullable=False)
    correct_answer = Column(String, nullable=False) # 'A', 'B', or 'C'
    task = relationship("EcoTask", back_populates="questions")

class StudentSubmission(Base):
    __tablename__ = "student_submissions"
    id = Column(UUID_COLUMN(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID_COLUMN(as_uuid=True), ForeignKey("students.id"))
    task_id = Column(UUID_COLUMN(as_uuid=True), ForeignKey("eco_tasks.id"))
    submission_data = Column(String) # For photo tasks, a placeholder URL. For quizzes, the score.
    status = Column(String, default='pending') # pending, approved, rejected
    submitted_at = Column(DateTime, default=func.now())
    student = relationship("Student", back_populates="submissions")
    task = relationship("EcoTask")

class Badge(Base):
    __tablename__ = "badges"
    id = Column(UUID_COLUMN(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False)
    description = Column(String)
    icon_url = Column(String) # URL to an emoji or image
    students = relationship("Student", secondary=student_badge_association, back_populates="badges")