from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import base64
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any

import jwt
import bcrypt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, EmailStr, ConfigDict

# ---------------- DB ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("contractor-checkin")

app = FastAPI(title="Contractor Check-In API")
api_router = APIRouter(prefix="/api")

# ---------------- Model helpers ----------------
def _validate_object_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: dict):
        if not doc:
            return None
        return cls(**doc)

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        data.pop("_id", None)
        return data


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Auth utils ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------- Schemas ----------------
class LoginInput(BaseModel):
    email: EmailStr
    password: str


class MapArea(BaseModel):
    lat: float = 20.5937
    lng: float = 78.9629
    zoom: int = 5


class CustomField(BaseModel):
    key: str
    label: str
    type: str = "text"        # "text" | "email" | "tel" | "textarea"
    required: bool = False


class JobInput(BaseModel):
    title: str
    description: str = ""
    hero_image_url: str = ""
    button_label: str = "Share Location"
    form_heading: str = "Your Details"
    custom_fields: List[CustomField] = Field(default_factory=list)
    default_map_area: MapArea = Field(default_factory=MapArea)
    display_mode: str = "map"          # "map" | "image" | "text"
    display_image_url: str = ""
    display_text: str = ""
    consent_enabled: bool = True
    consent_title: str = "Location Sharing Consent"
    consent_body: str = "To complete your check-in we need to access your device's GPS location. It is captured once, only when you tap the button, and shared with the site supervisor to verify your on-site attendance."
    consent_agree_label: str = "I Agree & Share Location"
    consent_decline_label: str = "Decline"
    share_title: str = ""
    share_description: str = ""
    share_image_url: str = ""
    active: bool = True


class Job(BaseDocument):
    title: str
    description: str = ""
    hero_image_url: str = ""
    button_label: str = "Share Location"
    form_heading: str = "Your Details"
    custom_fields: List[CustomField] = Field(default_factory=list)
    default_map_area: MapArea = Field(default_factory=MapArea)
    display_mode: str = "map"
    display_image_url: str = ""
    display_text: str = ""
    consent_enabled: bool = True
    consent_title: str = "Location Sharing Consent"
    consent_body: str = "To complete your check-in we need to access your device's GPS location. It is captured once, only when you tap the button, and shared with the site supervisor to verify your on-site attendance."
    consent_agree_label: str = "I Agree & Share Location"
    consent_decline_label: str = "Decline"
    share_title: str = ""
    share_description: str = ""
    share_image_url: str = ""
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class Settings(BaseModel):
    site_title: str = "TechSpider Site"
    logo_url: str = ""
    tagline: str = "Contractor Check-In Portal"
    browser_tab_title: str = ""
    share_title: str = ""
    share_description: str = ""
    share_image_url: str = ""
    primary_color: str = "#EA580C"
    admin_login_heading: str = "Admin Console"
    admin_login_subtitle: str = "Contractor Check-In"
    admin_login_bg_url: str = ""


class ResponseItem(BaseModel):
    key: str
    label: str
    value: str = ""


class CheckInInput(BaseModel):
    job_id: str
    responses: List[ResponseItem] = Field(default_factory=list)
    latitude: float
    longitude: float


class CheckIn(BaseDocument):
    job_id: str
    responses: List[ResponseItem] = Field(default_factory=list)
    contractor_name: str = ""
    email: str = ""
    latitude: float
    longitude: float
    created_at: str = Field(default_factory=now_iso)


# ---------------- Auth routes ----------------
COOKIE_MAX_AGE = 43200  # 12 hours


def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


@api_router.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email)
    _set_auth_cookie(response, token)
    return {
        "user": {"id": str(user["_id"]), "email": user["email"], "name": user.get("name", "Admin"), "role": user.get("role", "admin")},
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"status": "ok"}


@api_router.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return {"id": current["_id"], "email": current["email"], "name": current.get("name", "Admin"), "role": current.get("role", "admin")}


# ---------------- Settings ----------------
@api_router.get("/settings", response_model=Settings)
async def get_settings():
    doc = await db.settings.find_one({"_id": "global"})
    if not doc:
        return Settings()
    doc.pop("_id", None)
    return Settings(**doc)


@api_router.put("/settings", response_model=Settings)
async def update_settings(payload: Settings, current=Depends(get_current_user)):
    await db.settings.update_one({"_id": "global"}, {"$set": payload.model_dump()}, upsert=True)
    return payload


# ---------------- Jobs ----------------
@api_router.get("/jobs", response_model=List[Job], response_model_by_alias=False)
async def list_jobs(active_only: bool = False):
    query = {"active": True} if active_only else {}
    docs = await db.jobs.find(query).sort("created_at", -1).to_list(500)
    return [Job.from_mongo(d) for d in docs]


@api_router.get("/jobs/{job_id}", response_model=Job, response_model_by_alias=False)
async def get_job(job_id: str):
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    doc = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    return Job.from_mongo(doc)


@api_router.post("/jobs", response_model=Job, response_model_by_alias=False)
async def create_job(payload: JobInput, current=Depends(get_current_user)):
    job = Job(**payload.model_dump())
    doc = job.to_mongo()
    res = await db.jobs.insert_one(doc)
    doc["_id"] = res.inserted_id
    return Job.from_mongo(doc)


@api_router.put("/jobs/{job_id}", response_model=Job, response_model_by_alias=False)
async def update_job(job_id: str, payload: JobInput, current=Depends(get_current_user)):
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    await db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": payload.model_dump()})
    doc = await db.jobs.find_one({"_id": ObjectId(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    return Job.from_mongo(doc)


@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, current=Depends(get_current_user)):
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    await db.jobs.delete_one({"_id": ObjectId(job_id)})
    await db.checkins.delete_many({"job_id": job_id})
    return {"status": "deleted"}


# ---------------- Check-ins ----------------
@api_router.post("/checkins", response_model=CheckIn, response_model_by_alias=False)
async def create_checkin(payload: CheckInInput):
    if not ObjectId.is_valid(payload.job_id):
        raise HTTPException(status_code=400, detail="Invalid job")
    job = await db.jobs.find_one({"_id": ObjectId(payload.job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Derive display name/email from responses for the admin table (best effort)
    name = ""
    email = ""
    for r in payload.responses:
        k = (r.key or "").lower()
        if not name and (k in ("full_name", "name") or "name" in k):
            name = r.value
        if not email and (k == "email" or "email" in k):
            email = r.value

    checkin = CheckIn(**payload.model_dump(), contractor_name=name, email=email)
    doc = checkin.to_mongo()
    res = await db.checkins.insert_one(doc)
    doc["_id"] = res.inserted_id
    return CheckIn.from_mongo(doc)


@api_router.get("/jobs/{job_id}/checkins", response_model=List[CheckIn], response_model_by_alias=False)
async def public_job_checkins(job_id: str):
    docs = await db.checkins.find({"job_id": job_id}).sort("created_at", -1).to_list(500)
    return [CheckIn.from_mongo(d) for d in docs]


@api_router.get("/checkins", response_model=List[CheckIn], response_model_by_alias=False)
async def list_checkins(job_id: Optional[str] = None, current=Depends(get_current_user)):
    query = {"job_id": job_id} if job_id else {}
    docs = await db.checkins.find(query).sort("created_at", -1).to_list(2000)
    return [CheckIn.from_mongo(d) for d in docs]


@api_router.get("/")
async def root():
    return {"message": "Contractor Check-In API", "status": "ok"}


# ---------------- Image upload (auth) ----------------
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB


@api_router.post("/upload")
async def upload_image(file: UploadFile = File(...), current=Depends(get_current_user)):
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5MB).")
    import base64
    b64 = base64.b64encode(data).decode("utf-8")
    return {"url": f"data:{content_type};base64,{b64}"}


# ---------------- Social share image (public) ----------------
async def _load_settings() -> Settings:
    doc = await db.settings.find_one({"_id": "global"})
    if not doc:
        return Settings()
    doc.pop("_id", None)
    return Settings(**doc)


@api_router.get("/share-image")
async def share_image(job_id: Optional[str] = None):
    img = ""
    if job_id and ObjectId.is_valid(job_id):
        job = await db.jobs.find_one({"_id": ObjectId(job_id)})
        if job:
            img = job.get("share_image_url") or job.get("hero_image_url") or ""
    if not img:
        s = await _load_settings()
        img = s.share_image_url or s.logo_url or ""
    if img.startswith("data:") and "," in img:
        header, b64 = img.split(",", 1)
        ctype = header.split(";")[0].replace("data:", "") or "image/png"
        return Response(content=base64.b64decode(b64), media_type=ctype)
    if img.startswith("http"):
        return RedirectResponse(img)
    raise HTTPException(status_code=404, detail="No share image set")


app.include_router(api_router)


# ---------------- Server-rendered SPA (injects social meta for link previews) ----------------
INDEX_CANDIDATES = [
    os.environ.get("FRONTEND_INDEX_PATH"),
    str(ROOT_DIR.parent / "frontend" / "build" / "index.html"),
    str(ROOT_DIR.parent / "frontend" / "public" / "index.html"),
]


def _find_index_html() -> Optional[str]:
    for p in INDEX_CANDIDATES:
        if p and Path(p).is_file():
            return p
    return None


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _inject_meta(html: str, title: str, desc: str, image: str, url: str) -> str:
    tags = [
        f"<title>{_esc(title)}</title>",
        f'<meta name="description" content="{_esc(desc)}" />',
        '<meta property="og:type" content="website" />',
        f'<meta property="og:title" content="{_esc(title)}" />',
        f'<meta property="og:description" content="{_esc(desc)}" />',
        f'<meta property="og:url" content="{_esc(url)}" />',
        f'<meta name="twitter:card" content="{"summary_large_image" if image else "summary"}" />',
        f'<meta name="twitter:title" content="{_esc(title)}" />',
        f'<meta name="twitter:description" content="{_esc(desc)}" />',
    ]
    if image:
        tags.append(f'<meta property="og:image" content="{_esc(image)}" />')
        tags.append(f'<meta name="twitter:image" content="{_esc(image)}" />')
    html = re.sub(r"<title>.*?</title>", "", html, count=1, flags=re.DOTALL)
    html = re.sub(r'<meta\s+name="description"[^>]*>', "", html, flags=re.IGNORECASE)
    return html.replace("</head>", "\n    " + "\n    ".join(tags) + "\n</head>", 1)


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_spa(full_path: str, request: Request):
    if full_path.startswith("api"):
        raise HTTPException(status_code=404, detail="Not found")
    index_path = _find_index_html()
    if not index_path:
        return JSONResponse({"message": "Contractor Check-In API", "status": "ok"})
    html = Path(index_path).read_text(encoding="utf-8")
    s = await _load_settings()
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", request.url.netloc)
    base_url = f"{proto}://{host}"

    # Global defaults
    title = s.share_title or s.browser_tab_title or " — ".join([x for x in [s.site_title, s.tagline] if x]) or "Check-In"
    desc = s.share_description or s.tagline or ""
    has_image = bool(s.share_image_url or s.logo_url)
    image_query = ""

    # Per-job preview for /checkin/<jobId>
    m = re.match(r"checkin/([a-fA-F0-9]{24})", full_path)
    if m:
        jid = m.group(1)
        job = await db.jobs.find_one({"_id": ObjectId(jid)})
        if job:
            title = job.get("share_title") or job.get("title") or title
            desc = job.get("share_description") or job.get("description") or desc
            has_image = bool(job.get("share_image_url") or job.get("hero_image_url")) or has_image
            image_query = f"?job_id={jid}"

    image = f"{base_url}/api/share-image{image_query}" if has_image else ""
    url = f"{base_url}/{full_path}" if full_path else base_url
    return HTMLResponse(_inject_meta(html, title, desc, image, url))


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------- Startup seeding ----------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.checkins.create_index("job_id")

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": now_iso(),
        })
        logger.info("Seeded admin user")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Updated admin password")

    if not await db.settings.find_one({"_id": "global"}):
        await db.settings.update_one({"_id": "global"}, {"$set": Settings().model_dump()}, upsert=True)

    # One-time migration: give pre-existing jobs the new form fields + heading
    async for job in db.jobs.find({"form_heading": {"$exists": False}}):
        existing = job.get("custom_fields", [])
        keys = {f.get("key") for f in existing}
        defaults = []
        if not ({"full_name", "name"} & keys):
            defaults.append({"key": "full_name", "label": "Full Name", "type": "text", "required": True})
        if "email" not in keys:
            defaults.append({"key": "email", "label": "Email", "type": "email", "required": True})
        if "phone" not in keys:
            defaults.append({"key": "phone", "label": "Phone", "type": "tel", "required": True})
        await db.jobs.update_one(
            {"_id": job["_id"]},
            {"$set": {"form_heading": "Your Details", "custom_fields": defaults + existing}},
        )
    logger.info("Migrated existing jobs to editable form fields")

    if await db.jobs.count_documents({}) == 0:
        sample = Job(
            title="TechSpider Site — Downtown Tower",
            description="Welcome to the TechSpider construction site check-in. Please provide your details and share your location so our site supervisor can verify your arrival on-site.",
            hero_image_url="https://images.pexels.com/photos/10951145/pexels-photo-10951145.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
            button_label="Share My Location",
            form_heading="Your Details",
            custom_fields=[
                CustomField(key="full_name", label="Full Name", type="text", required=True),
                CustomField(key="email", label="Email", type="email", required=True),
                CustomField(key="phone", label="Phone", type="tel", required=True),
                CustomField(key="site_number", label="Site Number", type="text", required=True),
                CustomField(key="id_badge", label="ID Badge Number", type="text", required=False),
            ],
            default_map_area=MapArea(lat=40.7128, lng=-74.0060, zoom=12),
        )
        await db.jobs.insert_one(sample.to_mongo())
        logger.info("Seeded sample job")


@app.on_event("shutdown")
async def shutdown():
    client.close()
