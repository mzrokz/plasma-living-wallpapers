#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float radius;
    float curl;
    vec4 petalColor;
    vec4 lightColor;
};

void main()
{
    vec2 q = (qt_TexCoord0 - 0.5) * 2.6;
    vec2 s = q - vec2(0.14, 0.2);
    float shadow = smoothstep(1.0, 0.45, length(s * vec2(0.92, 1.4))) * 0.28;
    float x = (q.x + 1.0) * 0.5;
    float k = clamp(x, 0.0, 1.0);
    float h = 1.05 * pow(k, 0.62) * pow(1.0 - k, 0.4);
    float cleft = 0.16 * smoothstep(0.16, 0.0, abs(q.y));
    float e = min(h - abs(q.y), 1.0 - cleft - q.x);
    float m = clamp(e * radius / 1.2 + 0.5, 0.0, 1.0);
    vec3 c = mix(petalColor.rgb * vec3(0.96, 0.8, 0.86), petalColor.rgb, smoothstep(0.0, 0.7, k));
    c *= 0.9 + 0.2 * q.y * curl + 0.06 * sin(q.y * 16.0);
    vec4 col = vec4(0.0, 0.01, 0.015, 1.0) * shadow;
    col = vec4(c * m, m) + col * (1.0 - m);
    col.rgb *= lightColor.rgb * lightColor.a;
    fragColor = col * qt_Opacity;
}
