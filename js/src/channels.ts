"use strict";

import * as THREE from "three";

import {
    managers, IManagers
} from "./managers";

import {
    delete_undefined, Method, IPlotData
} from "./utils";

import {
    default_automatic_uniforms, IUniformMap, IDefines
} from "./uniforms";

import * as encodings from "./encodings";

// Get obj.name if obj is an object
function get_attrib<T>(obj: any, name: string): T | undefined {
    return obj === undefined ? undefined: obj[name];
}

export
function compute_range(array: number[]): number[] {
    let min = array[0];
    let max = array[0];
    for (let v of array) {
        min = Math.min(min, v);
        max = Math.max(max, v);
    }
    return [min, max];
}

export
function extended_range(min: number, max: number) {
    let range = max - min;
    let scale = range > 0.0 ? 1.0 / range : 1.0;
    return [min, max, range, scale];
}

export
function compute_texture_shape(size: number) {
    if (size <= 0) {
        throw new Error(`Expecting a positive size ${size}`);
    }
    const width = Math.pow(2, Math.floor(Math.log2(size) / 2));
    const height = Math.ceil(size / width);
    return [width, height];
}

const default_defines: { [key: string]: IDefines} = {
    surface: {
        ENABLE_SURFACE_MODEL: 1,
        // Enable this for debugging, shading by depth:
        //ENABLE_SURFACE_DEPTH_SHADING: 1,
    },
    isosurface: {
        ENABLE_ISOSURFACE_MODEL: 1,
    },
    xray: {
        ENABLE_XRAY_MODEL: 1,
    },
    min: {
        ENABLE_MIN_MODEL: 1,
    },
    max: {
        ENABLE_MAX_MODEL: 1,
    },
    sum: {
        ENABLE_SUM_MODEL: 1,
    },
    volume: {
        ENABLE_VOLUME_MODEL: 1,
        ENABLE_CELL_ORDERING: 1,
    },
};

function update_range_uniform(uniforms: IUniformMap, name: string, range: 'auto' | number[], array: number[]) {
    if (range) {
        const newrange = range === "auto" ? compute_range(array) : range;
        uniforms[name] = { value: extended_range(newrange[0], newrange[1]) };
    }
}

// TODO: Use or delete
function __allocate_value(item_size: number) {
    switch (item_size)
    {
    case 1:
        return 0;
    case 2:
        return new THREE.Vector2();
    case 3:
        return new THREE.Vector3();
    case 4:
        return new THREE.Vector4();
    case 9:
        return new THREE.Matrix3();
    case 16:
        return new THREE.Matrix4();
    default:
        throw { message: "Invalid item size", item_size: item_size };
    }
}

// TODO: Use or delete
function __update_uniform_value(uniform: THREE.IUniform, new_value: any) {
    if (typeof uniform.value === "number") {
        uniform.value = new_value;
    } else if (uniform.value.isVector2) {  // TODO: Clean up this verbosity, did this to get rid of some errors quickly
        uniform.value.set(new_value[0], new_value[1]);
    } else if (uniform.value.isVector3) {
        uniform.value.set(new_value[0], new_value[1], new_value[2]);
    } else if (uniform.value.isVector4) {
        uniform.value.set(new_value[0], new_value[1], new_value[2], new_value[3]);
    } else if (uniform.value.isVector2 || uniform.value.isVector3 || uniform.value.isVector4) {
        uniform.value.set(...new_value);
    } else if (uniform.value.isMatrix3 || uniform.value.isMatrix4) {
        uniform.value.set(...new_value);
    } else if (uniform.value.isColor) {
        // TODO: Consider better color handling
        if (new_value.isColor || typeof new_value === "string") {
            uniform.value.set(new_value);
        } else {
            // Assuming rgb triplet
            uniform.value.setRGB(new_value[0], new_value[1], new_value[2]);
        }
        // uniform.value.setHSL(...new_value);  // hsl triplet
    } else {
        console.warn("Unexpected uniform type " + (typeof uniform.value));
        uniform.value = new_value;
    }
}

/*  Old range update code TODO Review new code and delete this

        // Update associated data range
        if (enc.range !== undefined) {
            let newrange = null;
            if (enc.range === "auto") {
                newrange = compute_range(new_value);
            } else  {
                newrange = enc.range;
            }
            if (newrange !== null) {
                newrange = extended_range(...newrange);
                const range_name = "u_" + channel_name + "_range";
                if (uniforms.hasOwnProperty(range_name)) {
                    uniforms[range_name].value.set(...newrange);
                }
            }

            // FIXME: Autoupdate values in a cleaner way
            // if (method === "isosurface") {
            //     const isovalue_enc = FIXME;
            //     if (isovalue_enc.value === "auto") {
            //         const value_range = newrange;
            //         u.u_isovalue = 0.5 * (value_range[0] + value_range[1]);
            //     }
            //     if (isovalue_enc.spacing === "auto") {
            //         const num_intervals = isovalue_enc.num_intervals;
            //         let spacing = 0.0;
            //         switch (isovalue_enc.mode) {
            //         case "linear":
            //             spacing = (1.0 / num_intervals) * (value_range[1] - value_range[0]);
            //             break;
            //         case "log":
            //             spacing = Math.pow(value_range[1] / value_range[0], 1.0 / (num_intervals + 1.0));
            //             break;
            //         }
            //         u.u_isovalue_spacing = spacing;
            //     }
            // }
        }
*/

export
interface IShaderOptions {
    uniforms: IUniformMap;
    defines: IDefines;
    attributes?: any;
}

export
interface IHandlerOptions {
    data: IPlotData;
    managers: IManagers;
}

export
type ChannelHandler = (shaderOptions: IShaderOptions,
                       desc: encodings.IEncodingEntry,
                       handlerOptions?: IHandlerOptions) => void;

const channel_handlers: {[key: string]: ChannelHandler} = {
    cells: (shaderOptions: IShaderOptions, desc: encodings.ICellsEncodingEntry, handlerOptions: IHandlerOptions) => {
        const {uniforms, defines, attributes} = shaderOptions;
        const {data, managers} = handlerOptions;
        if (!desc.field) {
            throw new Error("Missing required cells field");
        }
        const key = desc.field;
        const array = data[key];

        const num_tetrahedrons = array.length / 4;
        const texture_shape = compute_texture_shape(num_tetrahedrons);

        uniforms['u_cell_texture_shape'] = { value: [...texture_shape] };

        const prev = get_attrib<THREE.DataTexture>(uniforms['t_cells'], "value");
        const value = managers.array_texture.update(
            key,
            {array: array, dtype: "int32", item_size: 4, texture_shape: texture_shape},
            prev);
        uniforms['t_cells'] = { value };

        if (0) {  // Use attributes if unsorted: c_cells, c_ordering
            //attributes.c_cells = managers.buffers.update(
            //    desc.field, data[desc.field], attributes.c_cells);
            // attributes.c_ordering = FIXME;
        }
    },
    coordinates: (shaderOptions: IShaderOptions, desc: encodings.ICellsEncodingEntry, handlerOptions: IHandlerOptions) => {
        const {uniforms, defines, attributes} = shaderOptions;
        const {data, managers} = handlerOptions;
        if (!desc.field) {
            throw new Error("Missing required coordinates field");
        }
        const key = desc.field;
        const array = data[key];

        const num_vertices = array.length / 3;
        const texture_shape = compute_texture_shape(num_vertices);
        uniforms['u_vertex_texture_shape'] = { value: [...texture_shape] };

        const prev = get_attrib<THREE.DataTexture>(uniforms['t_coordinates'], "value");
        const value = managers.array_texture.update(key,
            {array: array, dtype: "float32", item_size: 3, texture_shape: texture_shape },
            prev);
        uniforms['t_coordinates'] = { value };
    },
    indicators: (shaderOptions: IShaderOptions, desc: encodings.IIndicatorsEncodingEntry, handlerOptions: IHandlerOptions) => {
        const {uniforms, defines, attributes} = shaderOptions;
        const {data, managers} = handlerOptions;
        if (desc.field) {
            if (desc.space != "I3") {
                throw new Error("Only cell restriction has been implemented.");
            }
            if ((desc as any).lut) {
                throw new Error("LUT for restriction has not been implemented.");
            }

            const key = desc.field;
            const uname = "t_cell_indicators";

            const array = data[key];
            const dtype = "int32";
            const item_size = 1;
            const texture_shape = compute_texture_shape(array.length / item_size);
            const spec = {array, dtype, item_size, texture_shape};

            const prev = get_attrib<THREE.DataTexture>(uniforms[uname], "value");

            const value = managers.array_texture.update(key, spec, prev);
            uniforms[uname] = { value };

            uniforms['u_cell_indicator_value'] = { value: desc.value };

            defines['ENABLE_CELL_INDICATORS'] = 1;

            // FIXME: If not sorted, use attributes instead:
            // attributes.c_cell_indicators = managers.buffers.update(key, array, attributes.c_cell_indicators);
        }
    },
    wireframe: (shaderOptions: IShaderOptions, desc: encodings.IWireframeEncodingEntry) => {
        const {uniforms, defines} = shaderOptions;
        if (desc.enable) {
            defines['ENABLE_WIREFRAME'] = 1;
            uniforms['u_wireframe_color'] = { value: new THREE.Color(desc.color) };
            uniforms['u_wireframe_alpha'] = { value: desc.opacity };
            uniforms['u_wireframe_size'] = { value: desc.size };
        }
    },
    light: (shaderOptions: IShaderOptions, desc: encodings.ILightEncodingEntry) => {
        const {uniforms, defines} = shaderOptions;
        uniforms['u_emission_intensity_range'] = { value: [...desc.emission_intensity_range] };

        defines['ENABLE_SURFACE_LIGHT'] = 1;
    },
    density: (shaderOptions: IShaderOptions, desc: encodings.IDensityEncodingEntry, handlerOptions: IHandlerOptions) => {
        const {uniforms, defines} = shaderOptions;
        const {data, managers} = handlerOptions;
        defines['ENABLE_DENSITY'] = 1;

        if (desc.field) {
            const key = desc.field;
            const uname = "t_density";

            const array = data[key];
            const dtype = "float32";
            const item_size = 1;
            const texture_shape = compute_texture_shape(array.length / item_size);
            const spec = {array, dtype, item_size, texture_shape};

            const prev = get_attrib<THREE.DataTexture>(uniforms[uname], "value");

            const value = managers.array_texture.update(key, spec, prev);
            uniforms[uname] = { value };

            defines['ENABLE_DENSITY_FIELD'] = 1;
            if (desc.space !== "P0") {
                // TODO: Rename ENABLE_DENSITY_BACK -> ENABLE_DENSITY_LINEAR
                defines['ENABLE_DENSITY_BACK'] = 1;
            }

            update_range_uniform(uniforms, "u_density_range", desc.range, array);
        } else {
            uniforms['u_density_constant'] = { value: desc.constant };
        }

        if (desc.lut_field) {
            const key = desc.lut_field;
            const uname = "t_density_lut";

            const array = data[key];
            const item_size = 1;
            const dtype = "float32";
            const spec = {array, dtype, item_size};

            const prev = get_attrib<THREE.DataTexture>(uniforms[uname], "value");

            const value = managers.lut_texture.update(key, spec, prev);
            uniforms[uname] = { value };

            defines['ENABLE_DENSITY_LUT'] = 1;
        }
    },
    emission: (shaderOptions: IShaderOptions, desc: encodings.IEmissionEncodingEntry, handlerOptions: IHandlerOptions) => {
        const {uniforms, defines} = shaderOptions;
        const {data, managers} = handlerOptions;
        defines['ENABLE_EMISSION'] = 1;

        if (desc.field) {
            const key = desc.field;
            const uname = "t_emission";

            const array = data[key];
            const item_size = 1;
            const dtype = "float32";
            const texture_shape = compute_texture_shape(array.length / item_size);
            const spec = {array, dtype, item_size, texture_shape};

            const prev = get_attrib<THREE.DataTexture>(uniforms[uname], "value");

            const value = managers.array_texture.update(key, spec, prev);
            uniforms[uname] = { value };

            defines['ENABLE_EMISSION_FIELD'] = 1;
            if (desc.space !== "P0") {
                defines['ENABLE_EMISSION_BACK'] = 1;
            }

            update_range_uniform(uniforms, "u_emission_range", desc.range, array);
        } else {
            uniforms['u_emission_constant'] = { value: desc.constant };
        }

        if (desc.lut_field) {
            const key = desc.lut_field;
            const uname = "t_emission_lut";

            const array = data[key];
            const item_size = 3;
            const dtype = "float32";
            const spec = {array, dtype, item_size};

            const prev = get_attrib<THREE.DataTexture>(uniforms[uname], "value");

            const value = managers.lut_texture.update(key, spec, prev);
            uniforms[uname] = { value };

            defines['ENABLE_EMISSION_LUT'] = 1;
        }

        // This should always have a valid value
        uniforms['u_emission_color'] = { value: new THREE.Color(desc.color) };
    },
    isovalues: (shaderOptions: IShaderOptions, desc: encodings.IIsoValuesEncodingEntry) => {
        const {uniforms, defines} = shaderOptions;
        uniforms['u_isovalue'] = { value: desc.value };

        const scale_modes = ["linear", "log", "power"];
        if (scale_modes.indexOf(desc.mode) !== -1) {
            uniforms['u_isovalue_spacing'] = { value: desc.spacing };
        }

        if (desc.mode === "sweep") {
            uniforms['u_isovalue_sweep_period'] = { value: desc.period };
        }

        // TODO: Use a single define instead?
        const mode2define = (mode: encodings.IIsoValuesEncodingEntry['mode']) => {
            switch (mode) {
            case "single":
                return { USING_ISOSURFACE_MODE_SINGLE: 1 };
            case "sweep":
                return { USING_ISOSURFACE_MODE_SWEEP: 1 };
            case "linear":
                return { USING_ISOSURFACE_MODE_LINEAR: 1 };
            case "log":
                return { USING_ISOSURFACE_MODE_LOG: 1 };
            case "power":
                return { USING_ISOSURFACE_MODE_POWER: 1 };
            default:
                throw new Error(`Invalid isovalue mode ${mode}.`);
            }
        };
        Object.assign(defines, mode2define(desc.mode));
    },
    extinction: (shaderOptions: IShaderOptions, desc: encodings.IExtinctionEncodingEntry) => {
        const {uniforms} = shaderOptions;
        uniforms['u_extinction'] = { value: desc.value };
    },
    exposure: (shaderOptions: IShaderOptions, desc: encodings.IExposureEncodingEntry) => {
        const {uniforms} = shaderOptions;
        uniforms['u_exposure'] = { value: Math.pow(2.0, desc.value) };
    },
};

export
function create_three_data(method: Method,
                           encoding: encodings.IPartialEncoding,
                           data: IHandlerOptions['data']) {
    // const cell_texture_shape = compute_texture_shape(num_tetrahedrons);
    // const vertex_texture_shape = compute_texture_shape(num_vertices);

    // Initialize new set of uniforms
    //const defaults = default_uniforms();

    // Combine encoding with fallback values from default_encoding
    const default_encoding = encodings.default_encodings[method];
    const user_encoding = encoding;
    encoding = {} as encodings.IPartialEncoding;
    for (const channel in default_encoding) {
        // FIXME: Make this deep copy? Or perhaps we'll only read from this anyway?
        encoding[channel] = Object.assign({}, default_encoding[channel], user_encoding[channel]);
    }

    // Define initial default defines based on method
    const defines: IDefines = Object.assign({}, default_defines[method]);

    // TODO: ENABLE_CELL_ORDERING should be determined by need for sorting based on method
    defines['ENABLE_CELL_ORDERING'] = 1;

    // Should be updated by camera type in pre-render step:
    defines['ENABLE_PERSPECTIVE_PROJECTION'] = 1;

    // Initialize uniforms that are set by time and view changes
    const uniforms = default_automatic_uniforms();

    const attributes = {
        // FIXME: ?
    };

    // State that the handlers shouldn't touch
    const in_state = {
        method, encoding, data, managers //, defaults
    };

    // State that the handlers will modify in place
    const out_state = {
        uniforms, defines, attributes
    };

    // Map channels to uniforms
    for (let channel in encoding) {
        // This modifies uniforms in place
        const update_uniforms = channel_handlers[channel];
        const desc = encoding[channel]!;
        if (!update_uniforms) {
            throw new Error(`Missing channel handler for channel ${channel}`);
        }
        update_uniforms(out_state, desc, in_state);
    }

    // Remove undefined attributes
    delete_undefined(uniforms);
    delete_undefined(defines);
    delete_undefined(attributes);

    return { uniforms, defines, attributes };
}
