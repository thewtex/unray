// TODO: This can also be done without the LUT,
// using scaled_foo instead of mapped_foo

// Config checks
#if defined(ENABLE_EMISSION) && defined(ENABLE_DENSITY)
compile_error();  // Only emission OR density allowed.
#endif

#if !(defined(ENABLE_EMISSION) || defined(ENABLE_DENSITY))
compile_error();  // Need emission or density.
#endif

// Define color
#if defined(ENABLE_EMISSION_BACK)
vec3 C = min(mapped_emission, mapped_emission_back);  // CHECKME
#elif defined(ENABLE_EMISSION)
vec3 C = mapped_emission;  // CHECKME
#elif defined(ENABLE_DENSITY_BACK)
// TODO: Don't think this is reachable with current API
vec3 C = u_emission_color * min(mapped_density, mapped_density_back);  // CHECKME
fixme;
#elif defined(ENABLE_DENSITY)
// TODO: Don't think this is reachable with current API
vec3 C = u_emission_color * mapped_density;  // CHECKME
fixme;
#endif


// Opacity is unused for this mode
float a = 1.0;