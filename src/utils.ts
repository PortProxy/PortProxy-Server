export function generateRandomString(length: number) {
    let out = "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}


export type ObjectSchema = {
    [id: string]: ObjectSchema | "string" | "int" | "number" | "bool"
}

export function validateObject(object: Object, schema: ObjectSchema, verbose = false) {
    const safeObj: Object = {};
    const queuedChecks: string[][] = [];

    for (let key of Object.keys(schema)) {
        queuedChecks.push([key]);
    }

    for (let path of queuedChecks) {
        let type: any = schema;
        for (let subKey of path) {
            type = type[subKey];
        }

        let safeValue: any = safeObj;
        const leadupPath = path.slice(0, -1);
        for (let subKey of leadupPath) {
            safeValue = safeValue[subKey];
        }
        
        if (typeof type == "object") { // value is a sub-schema
            queuedChecks.push(...Object.keys(type).map(key => [...path, key]));
            safeValue[path[path.length - 1]] = {};
            
            if (verbose) {
                console.log(`Detected sub-schema '${path.join(".")}' correctly.`);
            }
        } else {
            let realValue: any = object;
            for (let subKey of path) {
                if (typeof realValue != "object") {
                    throw "Sub-schema key was not an object.";
                }
                realValue = realValue[subKey];
            }

            switch (type) {
                case "string":
                    if (typeof realValue != "string") {
                        throw "Value was not a string.";
                    }
                    break;
                case "int":
                    if (typeof realValue != "number" || Math.round(realValue) != realValue) {
                        throw "Value was not an int.";
                    }
                    break;
                case "number":
                    if (typeof realValue != "number") {
                        throw "Value was not a number.";
                    }
                    break;
                case "bool":
                    if (typeof realValue != "boolean") {
                        throw "Value was not a bool.";
                    }
                    break;
            }
            safeValue[path[path.length - 1]] = realValue;
            if (verbose) {
                console.log(`Passed '${path.join(".")}' type ${type} using '${realValue}'.`);
            }
        }
    }
    return safeObj;
}