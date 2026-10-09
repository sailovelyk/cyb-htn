import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    MONGODB_DATABASE: str = os.getenv("MONGODB_DATABASE", "aegislog")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "change-this-secret-in-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRES_IN: int = int(os.getenv("JWT_EXPIRES_IN", "86400"))
    CORS_ORIGINS: list = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    ML_MODELS_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "ml_models")
    DATA_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_LOG_RECORDS: int = 100000

    # Risk thresholds
    RISK_NORMAL_MAX: float = 0.30
    RISK_LOW_MAX: float = 0.60
    RISK_MEDIUM_MAX: float = 0.80
    RISK_HIGH_MAX: float = 0.90
    # Above 0.90 = CRITICAL

settings = Settings()
