FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Shell form so ${PORT} expands. Hosted platforms (Render, Fly, Cloud Run) assign
# a port at runtime and expect the process to bind it; a hardcoded 8000 would
# start cleanly, bind the wrong port, and then fail health checks with no error
# in the logs. Defaults to 8000 so docker-compose is unaffected.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
