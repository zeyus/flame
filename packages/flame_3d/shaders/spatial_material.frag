#version 460 core

// implementation based on https://learnopengl.com/PBR/Lighting

#define MAX_LIGHTS 8
#define PI 3.14159265359
#define EPSILON 0.0001

in vec2 fragTexCoord;
in vec4 fragColor;
in vec3 fragPosition;
smooth in vec3 fragNormal;

out vec4 outColor;

uniform sampler2D albedoTexture;  // Albedo texture

// material info

uniform Material {
  vec3 albedoColor;
  float metallic;
  float roughness;
} material;

// lighting info

uniform Light {
  vec4 position;
  vec4 color;
  vec4 intensity;
} lights[MAX_LIGHTS];

uniform AmbientLight {
  vec3 color;
  float intensity;
} ambientLight;

uniform LightsInfo {
  uint numLights;
} lightsInfo;

// camera info

uniform Camera {
  vec3 position;
} camera;

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float distributionGGX(vec3 normal, vec3 halfwayDir, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float num = a2;

  float NdotH = max(dot(normal, halfwayDir), 0.0);
  float NdotH2 = NdotH * NdotH;
  float b = (NdotH2 * (a2 - 1.0) + 1.0);
  float denom = PI * b * b;

  return num / denom;
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;

  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;

  return num / denom;
}

float geometrySmith(vec3 normal, vec3 viewDir, vec3 lightDir, float roughness) {
  float NdotV = max(dot(normal, viewDir), 0.0);
  float NdotL = max(dot(normal, lightDir), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

vec3 processLight(
  vec3 lightPos,
  vec3 lightColor,
  float lightIntensity,
  vec3 baseColor,
  vec3 normal,
  vec3 viewDir,
  vec3 diffuse
) {
  vec3 lightDirVec = lightPos - fragPosition;
  vec3 lightDir = normalize(lightDirVec);
  float distance = length(lightDirVec) + EPSILON;
  vec3 halfwayDir = normalize(viewDir + lightDir);

  float attenuation = lightIntensity / (distance * distance);
  vec3 radiance = lightColor * attenuation;

  // cook-torrance brdf
  float ndf = distributionGGX(normal, halfwayDir, material.roughness);
  float g = geometrySmith(normal, viewDir, lightDir, material.roughness);
  vec3 f = fresnelSchlick(max(dot(halfwayDir, viewDir), 0.0), diffuse);

  vec3 kS = f; // reflection/specular fraction
  vec3 kD = (vec3(1.0) - kS) * (1.0 - material.metallic); // refraction/diffuse fraction

  vec3 numerator = ndf * g * f;
  float denominator = 4.0 * max(dot(normal, viewDir), 0.0) * max(dot(normal, lightDir), 0.0) + EPSILON;
  vec3 specular = numerator / denominator;

  // add to outgoing radiance Lo
  float NdotL = max(dot(normal, lightDir), 0.0);
  return (kD * baseColor / PI + specular) * radiance * NdotL;
}

void main() {
  vec3 normal = normalize(fragNormal);
  vec3 viewDir = normalize(camera.position - fragPosition);

  vec3 baseColor = material.albedoColor;
  baseColor *= texture(albedoTexture, fragTexCoord).rgb;

  vec3 baseAmbient = vec3(0.03) * baseColor * ambientLight.color * ambientLight.intensity;
  vec3 ao = vec3(1.0); // white - no ambient occlusion for now
  vec3 ambient = baseAmbient * baseColor * ao;

  vec3 f0 = vec3(0.04);
  vec3 diffuse = mix(f0, baseColor, material.metallic);

  vec3 lo = vec3(0.0);

  for (uint i = 0; i < lightsInfo.numLights; i++) {
    vec3 lightPos = lights[i].position.xyz;
    vec3 lightColor = lights[i].color.xyz;
    float lightIntensity = lights[i].intensity.x;

    lo += processLight(lightPos, lightColor, lightIntensity, baseColor, normal, viewDir, diffuse);
  }

  vec3 color = ambient + lo;

  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0 / 2.2));

  int idx = int(lightsInfo.numLights) - 3;
  if (lights[idx].position.x == 0 && lights[idx].position.y == 0 && lights[idx].position.z == 0 && lights[idx].color.r == 0 && lights[idx].color.g == 0 && lights[idx].color.b == 0 && lights[idx].intensity.x == 0) {
    outColor = vec4(0.04, 0.0, 0.02, 1.0);
  } else {
    outColor = vec4(color, 1.0);
  }
}