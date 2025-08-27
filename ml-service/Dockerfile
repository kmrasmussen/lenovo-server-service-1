# Use the official Python slim image as a base
FROM python:3.13-slim

# Set the working directory in the container
WORKDIR /app

# Copy the uv binary from its official image to a global location
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy the dependency definition files
COPY pyproject.toml uv.lock ./

# Create the virtual environment and install all dependencies into it.
# This part is correct and works as intended.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=cache,target=/root/.cache/pip \
    uv venv && uv sync --frozen

# (Optional, for your own verification)
# This command will print the entire file structure so you can see
# that /app/.venv/bin/python and uvicorn are indeed present.
RUN ls -laR /app

# Copy the rest of your application's source code
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# ---- THE FINAL, CORRECT CMD ----
# 1. We directly call the Python interpreter from our virtual environment.
# 2. We use the `-m` flag to tell Python to run a module as a script.
# This is the most reliable method and avoids all previous issues.
CMD ["/app/.venv/bin/python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
