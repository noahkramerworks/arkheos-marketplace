from krita import Krita
from .extension import ArkheOSKritaBridgeExtension

Krita.instance().addExtension(ArkheOSKritaBridgeExtension(Krita.instance()))
