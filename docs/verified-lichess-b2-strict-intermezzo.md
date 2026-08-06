# Strict intermezzo infrastructure

The B2 classifier evaluates only the first learner decision after the source
pre-move. It supports a strict Zwischencheck or a strict non-checking capture
Zwischenzug only when an immediate legal recapture of the original capturer was
available, declined, and followed by either an exact-identity later recapture
or a legal mate while that original capturer continuously remains on its
recapture square. The production matcher and independent reference matcher use
the same canonical replay trace but make their decisions independently.

This is a structural filter, not an engine proof or a runtime curriculum. V1–V4
diagnostics and all scan outputs remain local-only. Every eventual learner
record still requires individual engine validation.
