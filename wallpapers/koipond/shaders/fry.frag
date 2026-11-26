#version 440
// A minnow and its shadow.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float phase;
    float px;            // body length in px
    vec2 shadowShift;    // body lengths, already rotated into fish space
    vec4 tint;
};

float shape(vec2 q, float soft)
{
    float x = 0.5 - q.x;                    // 0 nose .. 1 tail
    float y = q.y + 0.07 * x * x * sin(phase - x * 4.2);
    float b = clamp(x / 0.8, 0.0, 1.0);
    float w = 0.25 * pow(b, 0.5) * pow(1.0 - b, 0.8);
    float body = min(w - abs(y), x);
    float t = clamp((x - 0.74) / 0.26, 0.0, 1.0);
    float tail = min(0.012 + 0.09 * t - abs(y), min(x - 0.74, 0.88 + 1.1 * abs(y) - x));
    return smoothstep(-soft, soft, max(body, tail));
}

void main()
{
    vec2 q = (qt_TexCoord0 - 0.5) * vec2(2.0, 2.0);
    float sh = shape(q - shadowShift, 0.06) * 0.26;
    float m = shape(q, 0.8 / px);
    float y = abs(q.y);
    vec3 c = tint.rgb * (1.2 - 2.2 * y);
    c = mix(c, vec3(0.9, 0.93, 0.86), 0.45 * smoothstep(0.03, 0.0, abs(q.y - 0.02)));
    vec4 col = vec4(c * m, m) + vec4(0.0, 0.01, 0.015, 1.0) * sh * (1.0 - m);
    fragColor = col * qt_Opacity;
}
