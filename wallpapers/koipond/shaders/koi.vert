#version 440
// Bends a flat grid along the fish's spine. The grid's u axis runs nose -> tail,
// v runs across the body (wide enough to hold the fins).
layout(location = 0) in vec4 qt_Vertex;
layout(location = 1) in vec2 qt_MultiTexCoord0;
layout(location = 0) out vec2 vBody;   // x: 0 nose .. 1 tail tip, y: lateral, both in body lengths
layout(location = 1) out vec2 vTangent;

#include "koi_uniforms.glsl"

const float HALF_WIDTH = 0.28;

void main()
{
    vec2 p[12] = vec2[12](p0.xy, p0.zw, p1.xy, p1.zw, p2.xy, p2.zw,
                          p3.xy, p3.zw, p4.xy, p4.zw, p5.xy, p5.zw);
    float f = qt_MultiTexCoord0.x * 11.0;
    int i = int(min(floor(f), 10.0));
    float t = f - float(i);
    vec2 b = p[i];
    vec2 c = p[i + 1];
    vec2 a = i > 0 ? p[i - 1] : 2.0 * b - c;
    vec2 d = i < 10 ? p[i + 2] : 2.0 * c - b;

    vec2 k1 = c - a;
    vec2 k2 = 2.0 * a - 5.0 * b + 4.0 * c - d;
    vec2 k3 = -a + 3.0 * b - 3.0 * c + d;
    vec2 centre = b + 0.5 * t * (k1 + t * (k2 + t * k3));
    vec2 tangent = normalize(k1 + t * (2.0 * k2 + 3.0 * t * k3) + vec2(1e-5, 0.0));

    float y = (qt_MultiTexCoord0.y - 0.5) * 2.0 * HALF_WIDTH;
    vec2 pos = centre + vec2(-tangent.y, tangent.x) * y * bodyLength + shift;

    vBody = vec2(qt_MultiTexCoord0.x, y);
    vTangent = tangent;
    gl_Position = qt_Matrix * vec4(pos, 0.0, 1.0);
}
