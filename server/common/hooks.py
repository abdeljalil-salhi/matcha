from http import HTTPStatus

from flask import Flask, Response, request
from psycopg import errors as pg_errors
from psycopg_pool import PoolTimeout
from werkzeug.exceptions import HTTPException, InternalServerError

from .http import ApiError


def register_http_hooks(app: Flask) -> None:
    """Register the shared HTTP security, response, and error hooks.

    Args:
        app (Flask): Application that owns the hooks.

    Returns:
        None.
    """

    @app.before_request
    def protect_browser_writes() -> None:
        """Reject browser writes whose origin fails the CSRF policy.

        Returns:
            None: Request processing can continue.
        """
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return
        origin = request.headers.get("Origin")
        allowed_origins = {app.config["FRONTEND_URL"], request.host_url.rstrip("/")}
        if origin is not None and origin not in allowed_origins:
            raise ApiError(
                HTTPStatus.FORBIDDEN, "This origin cannot modify Matcha data."
            )
        if origin is None and request.headers.get("Sec-Fetch-Site") in {
            "cross-site",
            "same-site",
        }:
            raise ApiError(
                HTTPStatus.FORBIDDEN, "The request must include the frontend origin."
            )

    @app.after_request
    def response_headers(response: Response) -> Response:
        """Apply security, caching, and allowed-origin headers.

        Args:
            response (Response): Outgoing Flask response.

        Returns:
            Response: Updated response.
        """
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; sandbox",
        )
        response.headers["Referrer-Policy"] = "no-referrer"
        response.vary.add("Origin")
        if request.headers.get("Origin") == app.config["FRONTEND_URL"]:
            response.headers["Access-Control-Allow-Origin"] = app.config["FRONTEND_URL"]
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
            )
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException) -> Response:
        """Convert an HTTP exception to the standard JSON error format.

        Args:
            error (HTTPException): Raised HTTP error.

        Returns:
            Response: JSON error with the original status and headers.
        """
        response = error.get_response()
        response.data = app.json.dumps({"error": {"message": error.description}})
        response.content_type = "application/json"
        return response

    @app.errorhandler(PoolTimeout)
    @app.errorhandler(pg_errors.LockNotAvailable)
    @app.errorhandler(pg_errors.QueryCanceled)
    def temporarily_unavailable(_error: Exception) -> tuple[dict, int, dict]:
        """Translate database contention or timeout to a retryable error.

        Args:
            _error (Exception): Database exception handled by Flask.

        Returns:
            tuple[dict, int, dict]: Error payload, 503 status, and retry headers.
        """
        return (
            {"error": {"message": "The service is temporarily busy. Try again."}},
            HTTPStatus.SERVICE_UNAVAILABLE,
            {"Retry-After": "2"},
        )

    @app.errorhandler(HTTPStatus.INTERNAL_SERVER_ERROR)
    def internal_error(_error: InternalServerError) -> tuple[dict, int]:
        """Hide internal error details from the API client.

        Args:
            _error (InternalServerError): Error handled by Flask.

        Returns:
            tuple[dict, int]: Generic error payload and 500 status.
        """
        return {
            "error": {"message": "An unexpected server error occurred."}
        }, HTTPStatus.INTERNAL_SERVER_ERROR
