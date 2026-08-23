# Mock experiment rig for the plainpanel socket example.
#
# The server is the only source of truth: it owns all state, validates every
# command, and pushes a full Snapshot at 10 Hz. The pydantic models below ARE
# the contract — `npm run types` exports them to api.d.ts for the
# frontend's editor typechecking.
#
# Run from the repo root (no installs needed, uv fetches deps):
#   npm run server
# then open http://localhost:8780/examples/demo/
import asyncio
import math
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

REPO_ROOT = Path(__file__).resolve().parents[2]
TICK_S = 0.1  # 10 Hz


# ---------- the contract ----------

class Pose(BaseModel):
    x: float
    y: float
    z: float


class Snapshot(BaseModel):
    seq: int
    ready: bool
    armed: bool
    running: bool
    battery: float
    metric: float
    pose: Pose


class Param(BaseModel):
    name: str
    type: str  # float | choice | bool | str
    default: float | bool | str
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[str] | None = None
    help: str = ""


class Ok(BaseModel):
    ok: bool
    error: str = ""


# The single definition of what a run accepts. The frontend renders its form
# from this — it cannot drift from the server.
PARAMS = [
    Param(name="gain", type="float", default=0.5, min=0.0, max=1.0, step=0.01, help="controller gain"),
    Param(name="mode", type="choice", default="angle", options=["angle", "acro", "hover"]),
    Param(name="record", type="bool", default=True),
    Param(name="label", type="str", default="run-1"),
]


# ---------- the rig: fake hardware ----------

class Rig:
    def __init__(self) -> None:
        self.seq = 0
        self.t = 0.0
        self.armed = False
        self.running = False
        self.battery = 8.4
        self.metric = 1.0
        self.gain = 0.5

    def tick(self, dt: float) -> None:
        self.seq += 1
        self.t += dt
        if self.armed:
            self.battery = max(6.0, self.battery - 0.002 * dt * (30 if self.running else 3))
        if self.running:
            self.metric = max(0.001, self.metric * (1.0 - 0.2 * dt * self.gain))

    def snapshot(self) -> Snapshot:
        w = self.t * 2.0
        flying = self.running
        return Snapshot(
            seq=self.seq,
            ready=self.battery > 6.5,
            armed=self.armed,
            running=self.running,
            battery=self.battery,
            metric=self.metric,
            pose=Pose(
                x=0.3 * math.cos(w) if flying else 0.0,
                y=0.3 * math.sin(w) if flying else 0.0,
                z=1.0 + 0.2 * math.sin(w * 1.7) if flying else 0.0,
            ),
        )


rig = Rig()


async def pump() -> None:
    while True:
        rig.tick(TICK_S)
        await asyncio.sleep(TICK_S)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(pump())
    yield
    task.cancel()


app = FastAPI(title="plainpanel mock rig", lifespan=lifespan)


# ---------- API ----------

@app.get("/api/params", response_model=list[Param])
def params() -> list[Param]:
    return PARAMS


# Also exposes Snapshot over REST: one-shot reads without a socket, and it
# puts the model into the OpenAPI schema (the WebSocket alone would not).
@app.get("/api/snapshot", response_model=Snapshot)
def snapshot() -> Snapshot:
    return rig.snapshot()


@app.post("/api/arm", response_model=Ok)
def arm() -> Ok:
    if not rig.snapshot().ready:
        return Ok(ok=False, error="not ready: battery low")
    rig.armed = True
    return Ok(ok=True)


@app.post("/api/disarm", response_model=Ok)
def disarm() -> Ok:
    if rig.running:
        return Ok(ok=False, error="stop the run before disarming")
    rig.armed = False
    return Ok(ok=True)


@app.post("/api/start", response_model=Ok)
def start(values: dict) -> Ok:
    if not rig.armed:
        return Ok(ok=False, error="arm first")
    if rig.running:
        return Ok(ok=False, error="already running")
    known = {p.name for p in PARAMS}
    unknown = set(values) - known
    if unknown:
        return Ok(ok=False, error=f"unknown params: {sorted(unknown)}")
    rig.gain = float(values.get("gain", 0.5))
    rig.metric = 1.0
    rig.running = True
    return Ok(ok=True)


@app.post("/api/stop", response_model=Ok)
def stop() -> Ok:
    rig.running = False
    return Ok(ok=True)


@app.websocket("/api/ws")
async def ws(sock: WebSocket) -> None:
    await sock.accept()
    try:
        while True:
            await sock.send_text(rig.snapshot().model_dump_json())
            await asyncio.sleep(TICK_S)
    except WebSocketDisconnect:
        pass


# Serve the repo so /examples/demo/ and /dist/ share one origin.
app.mount("/", StaticFiles(directory=REPO_ROOT, html=True))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8780)
