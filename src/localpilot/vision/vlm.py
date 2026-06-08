"""Image description via a vision-capable LLM (VLM).

:func:`describe_image` reuses the existing OpenAI-compatible client, sending the
image inline as a base64 data URL in the OpenAI vision content format. The model
name comes from :class:`~localpilot.config.schema.VisionConfig`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from PIL import Image

from localpilot.config.schema import VisionConfig
from localpilot.llm.messages import Message, Role
from localpilot.vision.capture import to_base64_png

if TYPE_CHECKING:
    from localpilot.llm.base import LLMClient

#: The default screen-description prompt.
DEFAULT_VISION_PROMPT = (
    "Beschreibe den Bildschirm: sichtbare Fenster, wichtige Buttons, "
    "Textfelder und Status. Antworte knapp und strukturiert."
)


async def describe_image(
    client: LLMClient,
    config: VisionConfig,
    img: Image.Image,
    prompt: str | None = None,
) -> str:
    """Describe ``img`` using the configured vision model.

    Args:
        client: An OpenAI-compatible chat client.
        config: Vision configuration (model name and enabled flag).
        img: The image to describe.
        prompt: Optional instruction; falls back to :data:`DEFAULT_VISION_PROMPT`.

    Returns:
        The model's textual description, or a clear notice if vision is disabled.
    """

    if not config.enabled:
        return "Vision ist deaktiviert (vision.enabled = false)."

    data_url = f"data:image/png;base64,{to_base64_png(img)}"
    content: list[dict[str, Any]] = [
        {"type": "text", "text": prompt or DEFAULT_VISION_PROMPT},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]
    message = Message(role=Role.USER, content=content)
    response = await client.chat([message], model=config.model)
    return response.text
