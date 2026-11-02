import logging


def configure_application_logging() -> None:
    """Emit bounded application messages without relying on Uvicorn's root level."""
    logger = logging.getLogger("app.requests")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
