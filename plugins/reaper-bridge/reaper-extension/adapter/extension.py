"""Bridge-owned reverse-polling extension skeleton; no Bridge Runtime dependency."""

def register_bridge_timer(schedule, poll):
    return schedule(poll, first_interval=0.1, persistent=True)
