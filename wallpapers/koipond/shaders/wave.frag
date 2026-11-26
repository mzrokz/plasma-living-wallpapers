#version 440
// One step of the 2D wave equation. r = height now, g = height one step ago.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float c2;            // (wave speed * dt / cell)^2, at most 0.5 and only ever changing slowly
    float damping;
    float reset;
    vec2 cells;
    vec4 d0; vec4 d1; vec4 d2; vec4 d3; vec4 d4; vec4 d5;
    vec4 d6; vec4 d7; vec4 d8; vec4 d9; vec4 d10; vec4 d11;   // x, y, radius, strength (cells)
    vec4 stir;           // segment a.xy -> b.xy (cells)
    vec2 stirShape;      // radius, strength
};
layout(binding = 1) uniform sampler2D waveTex;

const float VISCOSITY = 0.03;   // calms the shortest ripples, where trouble starts; c2 + 2x this < 0.74
const float CREST = 1.6;        // waves flatten off towards this height

vec2 at(vec2 o) { return texture(waveTex, qt_TexCoord0 + o / cells).rg; }

float drop(vec4 d, vec2 p)
{
    if (d.w == 0.0)
        return 0.0;
    float r = length(p - d.xy) / d.z;
    return d.w * exp(-r * r * 2.0) * (1.0 - r * r);
}

void main()
{
    if (reset > 0.5) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    vec2 p = qt_TexCoord0 * cells;
    vec2 h = at(vec2(0.0));
    vec2 cross4 = at(vec2(1.0, 0.0)) + at(vec2(-1.0, 0.0)) + at(vec2(0.0, 1.0)) + at(vec2(0.0, -1.0));
    vec2 diag4 = at(vec2(1.0, 1.0)) + at(vec2(-1.0, 1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, -1.0));
    vec2 lap = (4.0 * cross4 + diag4 - 20.0 * h) / 6.0;
    float next = h.r + (h.r - h.g) * damping + c2 * lap.r + VISCOSITY * (lap.r - lap.g);
    next *= 0.9995;

    next += drop(d0, p) + drop(d1, p) + drop(d2, p) + drop(d3, p) + drop(d4, p) + drop(d5, p)
          + drop(d6, p) + drop(d7, p) + drop(d8, p) + drop(d9, p) + drop(d10, p) + drop(d11, p);

    if (stirShape.y > 0.0) {
        vec2 ab = stir.zw - stir.xy;
        float len = length(ab);
        vec2 dir = ab / max(len, 1e-3);
        float t = clamp(dot(p - stir.xy, dir), 0.0, len);
        vec2 off = p - stir.xy - dir * t;
        float r = length(off) / stirShape.x;
        // Pile water up ahead of the finger, leave a trough behind it.
        float ahead = clamp(dot(p - stir.zw, dir) / stirShape.x, -1.0, 1.0);
        next += stirShape.y * exp(-r * r * 2.0) * (0.35 + ahead);
    }

    // Soak up waves at the rim instead of bouncing them back.
    vec2 edge = min(p, cells - p);
    next *= mix(0.9, 1.0, smoothstep(0.0, 8.0, min(edge.x, edge.y)));
    // Whatever is thrown at it stays finite.
    next = clamp(next, -8.0, 8.0);
    float over = next / CREST;
    next /= sqrt(sqrt(1.0 + over * over * over * over));
    fragColor = vec4(next, h.r, 0.0, 1.0);
}
