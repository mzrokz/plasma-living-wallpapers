// Half width of the body at x.
float bodyWidth(float x)
{
    float b = clamp((x - 0.008) / 0.79, 0.0, 1.0);
    float w = 0.232 * pow(b, 0.46) * pow(1.0 - b, 0.86);
    float stem = 0.017 * smoothstep(0.1, 0.5, x);
    return sqrt(w * w + stem * stem);
}

// A paddle-shaped fin growing from `root`. Returns (signed distance-ish, along, across).
vec3 paddle(vec2 q, vec2 root, float angle, float len, float wid)
{
    vec2 d = q - root;
    float c = cos(angle), s = sin(angle);
    vec2 l = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
    float a = l.x / len;
    float k = clamp(a, 0.0, 1.0);
    float h = wid * pow(k, 0.55) * sqrt(max(0.0, 1.0 - pow(k, 3.2))) + 0.004 * step(0.0, a) * step(a, 0.6);
    float e = min(h - abs(l.y), min(l.x + 0.01, len - l.x));
    return vec3(e, a, l.y / max(h, 1e-4));
}

// Forked tail. Returns (signed distance-ish, along, across).
vec3 tailFin(vec2 q)
{
    float a = (q.x - 0.735) / 0.265;
    float k = clamp(a, 0.0, 1.0);
    float h = 0.012 + 0.088 * pow(k, 1.15);
    float across = q.y / h;
    float edge = 0.865 + 0.125 * pow(min(abs(across), 1.0), 1.3);
    float e = min(h - abs(q.y), (edge - q.x) * 0.8);
    e = min(e, q.x - 0.735);
    return vec3(e, a, across);
}
