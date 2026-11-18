from flask import Blueprint, Response, render_template, send_from_directory

routes = Blueprint(
    "docs",
    __name__,
    template_folder="templates",
    static_folder="static",
    static_url_path="/docs/assets",
)


@routes.get("/docs", strict_slashes=False)
def swagger_ui() -> Response:
    """Render the browser interface for the API contract.

    Returns:
        Response: Swagger UI with a page-specific content security policy.
    """
    response = Response(render_template("swagger.html"), mimetype="text/html")
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; img-src 'self' data: blob:; "
        "base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    )
    return response


@routes.get("/openapi.json")
def openapi() -> Response:
    """Serve the hand-written OpenAPI document.

    Returns:
        Response: OpenAPI specification as JSON.
    """
    return send_from_directory(routes.root_path, "openapi.json")
