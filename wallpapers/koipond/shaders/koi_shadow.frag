#version 440
layout(location = 0) in vec2 vBody;
layout(location = 1) in vec2 vTangent;
layout(location = 0) out vec4 fragColor;

#include "koi_uniforms.glsl"
#include "koi_shape.glsl"

void main()
{
    vec2 q = vBody;
    vec2 m = vec2(q.x, abs(q.y));
    float sweep = q.y < 0.0 ? fins.x : fins.y;
    float ends = smoothstep(0.0, blur + 0.03, q.x) * (1.0 - smoothstep(0.76, 0.8, q.x));
    float body = smoothstep(-blur, blur, bodyWidth(q.x) * 0.95 - m.y) * ends;
    float tail = smoothstep(-blur * 0.5, blur, tailFin(q).x) * 0.6;
    float pect = smoothstep(-blur * 0.4, blur, paddle(m, vec2(0.225, bodyWidth(0.225) * 0.82), 0.92 - sweep, 0.152, 0.05).x) * 0.5;
    float a = max(body, max(tail, pect));
    a *= smoothstep(0.28, 0.2, m.y) * (1.0 - smoothstep(0.94, 1.0, q.x));
    a *= mix(0.4, 0.58, depth);
    fragColor = vec4(vec3(0.0, 0.012, 0.02) * a, a) * qt_Opacity;
}
