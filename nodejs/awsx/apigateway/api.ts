// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// These APIs are currently experimental and may change.

import * as fs from "fs";
import * as mime from "mime";
import * as fspath from "path";

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { sha1hash } from "../utils";

export interface Request {
    resource: string;
    path: string;
    httpMethod: string;
    headers: { [header: string]: string; };
    queryStringParameters: { [param: string]: string; };
    pathParameters: { [param: string]: string; };
    stageVariables: { [name: string]: string; };
    requestContext: RequestContext;
    body: string;
    isBase64Encoded: boolean;
}

export interface RequestContext {
    accountId: string;
    resourceId: string;
    stage: string;
    requestId: string;
    identity: RequestIdentity;
    resourcePath: string;
    httpMethod: string;
    apiId: string;
}

export interface RequestIdentity {
    cognitoIdentityPoolId?: string;
    accountId?: string;
    cognitoIdentityId?: string;
    caller?: string;
    apiKey?: string;
    sourceIp?: string;
    cognitoAuthenticationType?: string;
    cognitoAuthenticationProvider?: string;
    userArn?: string;
    userAgent?: string;
    user?: string;
}

export interface Response {
    isBase64Encoded?: boolean;
    statusCode: number;
    headers?: { [header: string]: string; };
    body: string;
}

export type Method = "ANY" | "GET" | "PUT" | "POST" | "DELETE" | "PATCH";

/**
 * A route that that APIGateway should accept and forward to some type of destination. All routes
 * have an incoming path that they match against.  However, destinations are determined by the kind
 * of the route.  See [EventHandlerRoute], [StaticRoute], [ProxyRoute] and [RawJsonRoute] for
 * additional details.
 */
export type Route = EventHandlerRoute | StaticRoute | IntegrationRoute | RawDataRoute;

export type EventHandlerRoute = {
    path: string;
    method: Method;
    eventHandler: aws.lambda.EventHandler<Request, Response>;
};

function isEventHandler(route: Route): route is EventHandlerRoute {
    return (<EventHandlerRoute>route).eventHandler !== undefined;
}

/**
 * StaticRoute is a route that will map from an incoming path to the files/directories specified by
 * [localPath].
 */
export type StaticRoute = {
    path: string;
    /**
     * The local path on disk to create static S3 resources for.  Files will be uploaded into S3
     * objects, and directories will be recursively walked into.
     */
    localPath: string;

    /**
     * The `content-type` to serve the file as.  Only valid when localPath points to a file.  If
     * localPath points to a directory, the content types for all files will be inferred.
     */
    contentType?: string;

    /**
     * By default API.static will also serve 'index.html' in response to a request on a directory.
     * To disable this set false or to supply a new index pass an appropriate name.
     */
    index?: boolean | string;
};

function isStaticRoute(route: Route): route is StaticRoute {
    return (<StaticRoute>route).localPath !== undefined;
}

/**
 * An apigateway route for an integration.
 * https://docs.aws.amazon.com/apigateway/api-reference/resource/integration/ for more details.
 */
export interface IntegrationRoute {
    path: string;
    target: pulumi.Input<IntegrationTarget> | IntegrationRouteTargetProvider;
}

export type IntegrationConnectionType = "INTERNET" | "VPC_LINK";
export type IntegrationType = "aws" | "aws_proxy" | "http" | "http_proxy" | "mock";
export type IntegrationPassthroughBehavior = "when_no_match" | "when_no_templates" | "never";

/**
 * See https://docs.aws.amazon.com/apigateway/api-reference/resource/integration/ for more details.
 */
export interface IntegrationTarget {
    /**
     * Specifies an API method integration type. The valid value is one of the following:
     *
     * aws: for integrating the API method request with an AWS service action, including the Lambda
     * function-invoking action. With the Lambda function-invoking action, this is referred to as
     * the Lambda custom integration. With any other AWS service action, this is known as AWS
     * integration.
     *
     * aws_proxy: for integrating the API method request with the Lambda function-invoking action
     * with the client request passed through as-is. This integration is also referred to as the
     * Lambda proxy integration.
     *
     * http: for integrating the API method request with an HTTP endpoint, including a private HTTP
     * endpoint within a VPC. This integration is also referred to as the HTTP custom integration.
     *
     * http_proxy: for integrating the API method request with an HTTP endpoint, including a private
     * HTTP endpoint within a VPC, with the client request passed through as-is. This is also
     * referred to as the HTTP proxy integration.
     *
     * mock: for integrating the API method request with API Gateway as a "loop-back" endpoint
     * without invoking any backend.
     */
    type: pulumi.Input<IntegrationType>;

    /**
     * Specifies the integration's HTTP method type.  Currently, the only supported type is 'ANY'.
     */
    httpMethod?: "ANY";

    /**
     * Specifies Uniform Resource Identifier (URI) of the integration endpoint.
     *
     * For HTTP or HTTP_PROXY integrations, the URI must be a fully formed, encoded HTTP(S) URL
     * according to the RFC-3986 specification, for either standard integration, where
     * connectionType is not VPC_LINK, or private integration, where connectionType is VPC_LINK. For
     * a private HTTP integration, the URI is not used for routing.
     *
     * For AWS or AWS_PROXY integrations, the URI is of the form
     * arn:aws:apigateway:{region}:{subdomain.service|service}:path|action/{service_api}. Here,
     * {Region} is the API Gateway region (e.g., us-east-1); {service} is the name of the integrated
     * AWS service (e.g., s3); and {subdomain} is a designated subdomain supported by certain AWS
     * service for fast host-name lookup. action can be used for an AWS service action-based API,
     * using an Action={name}&{p1}={v1}&p2={v2}... query string. The ensuing {service_api} refers to
     * a supported action {name} plus any required input parameters. Alternatively, path can be used
     * for an AWS service path-based API. The ensuing service_api refers to the path to an AWS
     * service resource, including the region of the integrated AWS service, if applicable. For
     * example, for integration with the S3 API of GetObject, the uri can be either
     * arn:aws:apigateway:us-west-2:s3:action/GetObject&Bucket={bucket}&Key={key} or
     * arn:aws:apigateway:us-west-2:s3:path/{bucket}/{key}
     */
    uri: pulumi.Input<string>;

    /**
     * The type of the network connection to the integration endpoint. The valid value is INTERNET
     * for connections through the public routable internet or VPC_LINK for private connections
     * between API Gateway and a network load balancer in a VPC. The default value is INTERNET.
     */
    connectionType?: pulumi.Input<IntegrationConnectionType>;

    /**
     * The (id) of the VpcLink used for the integration when connectionType=VPC_LINK and undefined,
     * otherwise.
     */
    connectionId?: pulumi.Input<string>;

    /**
     * Specifies how the method request body of an unmapped content type will be passed through the
     * integration request to the back end without transformation.
     *
     * The valid value is one of the following:
     *
     * WHEN_NO_MATCH: passes the method request body through the integration request to the back end
     * without transformation when the method request content type does not match any content type
     * associated with the mapping templates defined in the integration request.
     *
     * WHEN_NO_TEMPLATES: passes the method request body through the integration request to the back
     * end without transformation when no mapping template is defined in the integration request. If
     * a template is defined when this option is selected, the method request of an unmapped
     * content-type will be rejected with an HTTP 415 Unsupported Media Type response.
     *
     * NEVER: rejects the method request with an HTTP 415 Unsupported Media Type response when
     * either the method request content type does not match any content type associated with the
     * mapping templates defined in the integration request or no mapping template is defined in the
     * integration request.
     *
     * Defaults to 'WHEN_NO_MATCH' if unspecified.
     */
    passthroughBehavior?: pulumi.Input<IntegrationPassthroughBehavior>;
}

export interface IntegrationRouteTargetProvider {
    target(name: string, parent: pulumi.Resource): pulumi.Input<IntegrationTarget>;
}

function isIntegrationRouteTargetProvider(obj: any): obj is IntegrationRouteTargetProvider {
    return (<IntegrationRouteTargetProvider>obj).target !== undefined;
}

function isIntegrationRoute(route: Route): route is IntegrationRoute {
    return (<IntegrationRoute>route).target !== undefined;
}

/**
 * Fallback route for when raw swagger control is desired.  The [data] field should be a javascript
 * object that will be then included in the final swagger specification like so:
 *
 * `"paths": { [path]: { [method]: data } }`
 *
 * This value will be JSON.stringify'd as part of normal processing.  It should not be passed as
 * string here.
 */
export type RawDataRoute = {
    path: string;
    method: Method;
    data: any;
};

function isRawDataRoute(route: Route): route is RawDataRoute {
    return (<RawDataRoute>route).data !== undefined;
}

export interface Endpoint {
    hostname: string;
    port: number;
    loadBalancer: aws.elasticloadbalancingv2.LoadBalancer;
}

export interface APIArgs {
    /**
     * Routes to use to initialize the APIGateway.
     *
     * Either [swaggerString] or [routes] must be specified.
     */
    routes?: Route[];

    /**
     * A Swagger specification already in string form to use to initialize the APIGateway.  Note
     * that you must manually provide permission for any route targets to be invoked by API Gateway
     * when using [swaggerString].
     *
     * Either [swaggerString] or [routes] must be specified.
     */
    swaggerString?: pulumi.Input<string>;

    stageName?: pulumi.Input<string>;
}

export class API extends pulumi.ComponentResource {
    public restAPI: aws.apigateway.RestApi;
    public deployment: aws.apigateway.Deployment;
    public stage: aws.apigateway.Stage;

    public url: pulumi.Output<string>;

    constructor(name: string, args: APIArgs, opts: pulumi.ComponentResourceOptions = {}) {
        super("aws:apigateway:x:API", name, {}, opts);

        let swaggerString: pulumi.Output<string>;
        let swaggerSpec: SwaggerSpec | undefined;
        let swaggerLambdas: SwaggerLambdas | undefined;
        if (args.swaggerString) {
            swaggerString = pulumi.output(args.swaggerString);
        }
        else if (args.routes) {
            const result = createSwaggerSpec(this, name, args.routes);
            swaggerSpec = result.swagger;
            swaggerLambdas = result.swaggerLambdas;
            swaggerString = pulumi.output(swaggerSpec).apply(JSON.stringify);
        }
        else {
            throw new pulumi.ResourceError(
                "API must specify either [swaggerString] or as least one of the [route] options.", opts.parent);
        }

        const stageName = args.stageName || "stage";

        // Create the API Gateway Rest API, using a swagger spec.
        this.restAPI = new aws.apigateway.RestApi(name, {
            body: swaggerString,
        }, { parent: this });

        // Create a deployment of the Rest API.
        this.deployment = new aws.apigateway.Deployment(name, {
            restApi: this.restAPI,
            // Note: Set to empty to avoid creating an implicit stage, we'll create it explicitly below instead.
            stageName: "",
            // Note: We set `variables` here because it forces recreation of the Deployment object
            // whenever the body hash changes.  Because we use a blank stage name above, there will
            // not actually be any stage created in AWS, and thus these variables will not actually
            // end up anywhere.  But this will still cause the right replacement of the Deployment
            // when needed.  The Stage allocated below will be the stable stage that always points
            // to the latest deployment of the API.
            variables: {
                version: swaggerString.apply(sha1hash),
            },
        }, { parent: this });

        const permissions = createLambdaPermissions(this, name, swaggerLambdas);

        // Expose the URL that the API is served at.
        this.url = pulumi.interpolate `${this.deployment.invokeUrl}${stageName}/`;

        // Create a stage, which is an addressable instance of the Rest API. Set it to point at the latest deployment.
        this.stage = new aws.apigateway.Stage(name, {
            restApi: this.restAPI,
            deployment: this.deployment,
            stageName: stageName,
        }, { parent: this, dependsOn: permissions });

        this.registerOutputs({});
    }
}

function createLambdaPermissions(api: API, name: string, swaggerLambdas: SwaggerLambdas = {}) {
    const permissions: aws.lambda.Permission[] = [];
    for (const path of Object.keys(swaggerLambdas)) {
        for (const method of Object.keys(swaggerLambdas[path])) {
            const methodAndPath =
                `${method === "x-amazon-apigateway-any-method" ? "*" : method.toUpperCase()}${path}`;

            permissions.push(new aws.lambda.Permission(name + "-" + sha1hash(methodAndPath), {
                action: "lambda:invokeFunction",
                function: swaggerLambdas[path][method],
                principal: "apigateway.amazonaws.com",
                // We give permission for this function to be invoked by any stage at the given method and
                // path on the API. We allow any stage instead of encoding the one known stage that will be
                // deployed by Pulumi because the API Gateway console "Test" feature invokes the route
                // handler with the fake stage `test-invoke-stage`.
                sourceArn: pulumi.interpolate `${api.deployment.executionArn}*/${methodAndPath}`,
            }, { parent: api }));
        }
    }

    return permissions;
}

interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: SwaggerOperation; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
    "x-amazon-apigateway-gateway-responses": Record<string, SwaggerGatewayResponse>;
}

interface SwaggerLambdas {
    [path: string]: { [method: string]: aws.lambda.Function };
}

interface SwaggerGatewayResponse {
    statusCode: number;
    responseTemplates: {
        "application/json": string,
    };
}

interface SwaggerInfo {
    title: string;
    version: string;
}

interface SwaggerOperation {
    parameters?: any[];
    responses?: { [code: string]: SwaggerResponse };
    "x-amazon-apigateway-integration": ApigatewayIntegration;
}

interface SwaggerResponse {
    description: string;
    schema?: SwaggerSchema;
    headers?: { [header: string]: SwaggerHeader };
}

interface SwaggerSchema {
    type: string;
}

interface SwaggerHeader {
    type: "string" | "number" | "integer" | "boolean" | "array";
    items?: SwaggerItems;
}

interface SwaggerItems {
    type: "string" | "number" | "integer" | "boolean" | "array";
    items?: SwaggerItems;
}

interface SwaggerAPIGatewayIntegrationResponse {
    statusCode: string;
    responseParameters?: { [key: string]: string };
}

interface ApigatewayIntegration {
    requestParameters?: any;
    passthroughBehavior?: pulumi.Input<IntegrationPassthroughBehavior>;
    httpMethod: pulumi.Input<Method>;
    type: pulumi.Input<IntegrationType>;
    responses?: { [pattern: string]: SwaggerAPIGatewayIntegrationResponse };
    uri: pulumi.Input<string>;
    connectionType?: pulumi.Input<IntegrationConnectionType | undefined>;
    connectionId?: pulumi.Input<string | undefined>;
    credentials?: pulumi.Output<string>;
}

function createSwaggerSpec(api: API, name: string, routes: Route[]) {

    // Set up the initial swagger spec.
    const swagger: SwaggerSpec = {
        swagger: "2.0",
        info: { title: name, version: "1.0" },
        paths: {},
        "x-amazon-apigateway-binary-media-types": ["*/*"],
        // Map paths the user doesn't have access to as 404.
        // http://docs.aws.amazon.com/apigateway/latest/developerguide/supported-gateway-response-types.html
        "x-amazon-apigateway-gateway-responses": {
            "MISSING_AUTHENTICATION_TOKEN": {
                "statusCode": 404,
                "responseTemplates": {
                    "application/json": "{\"message\": \"404 Not found\" }",
                },
            },
            "ACCESS_DENIED": {
                "statusCode": 404,
                "responseTemplates": {
                    "application/json": "{\"message\": \"404 Not found\" }",
                },
            },
        },
    };

    const swaggerLambdas: SwaggerLambdas = { };

    // Now add all the routes to it.

    // For static routes, we'll end up creating a bucket to store all the data.  We only want to do
    // this once.  So have a value here that can be lazily initialized the first route we hit, which
    // can then be used for all successive static routes.
    let staticRouteBucket: aws.s3.Bucket | undefined;

    for (const route of routes) {
        checkRoute(api, route, "path");
        swaggerLambdas[route.path] = swaggerLambdas[route.path] || {};

        if (isEventHandler(route)) {
            addEventHandlerRouteToSwaggerSpec(api, name, swagger, swaggerLambdas, route);
        }
        else if (isStaticRoute(route)) {
            staticRouteBucket = addStaticRouteToSwaggerSpec(api, name, swagger, route, staticRouteBucket);
        }
        else if (isIntegrationRoute(route)) {
            addIntegrationRouteToSwaggerSpec(api, name, swagger, route);
        }
        else if (isRawDataRoute(route)) {
            addRawDataRouteToSwaggerSpec(api, name, swagger, route);
        }
        else {
            const exhaustiveMatch: never = route;
            throw new Error("Non-exhaustive match for route");
        }
    }

    return { swagger, swaggerLambdas };
}

function addSwaggerOperation(swagger: SwaggerSpec, path: string, method: string, operation: SwaggerOperation) {
    if (!swagger.paths[path]) {
        swagger.paths[path] = {};
    }

    swagger.paths[path][method] = operation;
}

function checkRoute<TRoute>(api: API, route: TRoute, propName: keyof TRoute) {
    if (route[propName] === undefined) {
        throw new pulumi.ResourceError(`Route missing required [${propName}] property`, api);
    }
}

function addEventHandlerRouteToSwaggerSpec(
    api: API, name: string,
    swagger: SwaggerSpec,
    swaggerLambdas: SwaggerLambdas,
    route: EventHandlerRoute) {

    checkRoute(api, route, "eventHandler");
    checkRoute(api, route, "method");

    const method = swaggerMethod(route.method);
    const lambda = aws.lambda.createFunctionFromEventHandler(
        name + sha1hash(method + ":" + route.path), route.eventHandler, { parent: api });

    addSwaggerOperation(swagger, route.path, method, createSwaggerOperationForLambda());
    swaggerLambdas[route.path][method] = lambda;
    return;

    function createSwaggerOperationForLambda(): SwaggerOperation {
        const region = aws.config.requireRegion();
        const uri = pulumi.interpolate
            `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambda.arn}/invocations`;

        return {
            "x-amazon-apigateway-integration": {
                uri: uri,
                passthroughBehavior: "when_no_match",
                httpMethod: "POST",
                type: "aws_proxy",
            },
        };
    }
}

function addStaticRouteToSwaggerSpec(
    api: API, name: string, swagger: SwaggerSpec, route: StaticRoute,
    bucket: aws.s3.Bucket | undefined) {

    checkRoute(api, route, "localPath");

    const method = swaggerMethod("GET");

    const parentOpts = { parent: api };
    // Create a bucket to place all the static data under.
    bucket = bucket || new aws.s3.Bucket(safeS3BucketName(name), undefined, parentOpts);

    // For each static file, just make a simple bucket object to hold it, and create a swagger path
    // that routes from the file path to the arn for the bucket object.
    //
    // For static directories, use greedy api-gateway path matching so that we can map a single api
    // gateway route to all the s3 bucket objects we create for the files in these directories.
    const stat = fs.statSync(route.localPath);
    if (stat.isFile()) {
        processFile(route);
    }
    else if (stat.isDirectory()) {
        processDirectory(route);
    }

    return bucket;

    function createRole(key: string) {
        // Create a role and attach it so that this route can access the AWS bucket.
        const role = new aws.iam.Role(key, {
            assumeRolePolicy: JSON.stringify(apigatewayAssumeRolePolicyDocument),
        }, parentOpts);
        const attachment = new aws.iam.RolePolicyAttachment(key, {
            role: role,
            policyArn: aws.iam.AmazonS3FullAccess,
        }, parentOpts);

        return role;
    }

    function createBucketObject(key: string, localPath: string, contentType?: string) {
        return new aws.s3.BucketObject(key, {
            bucket: bucket!,
            key: key,
            source: new pulumi.asset.FileAsset(localPath),
            contentType: contentType || mime.getType(localPath) || undefined,
        }, parentOpts);
    }

    function processFile(route: StaticRoute) {
        const key = name + sha1hash(method + ":" + route.path);
        const role = createRole(key);

        createBucketObject(key, route.localPath, route.contentType);

        addSwaggerOperation(swagger, route.path, method, createSwaggerOperationForObjectKey(key, role));
    }

    function processDirectory(directory: StaticRoute) {
        const directoryServerPath = route.path.endsWith("/") ? route.path : route.path + "/";

        const directoryKey = name + sha1hash(method + ":" + directoryServerPath);
        const role = createRole(directoryKey);

        let startDir = directory.localPath.startsWith("/")
            ? directory.localPath
            : fspath.join(process.cwd(), directory.localPath);

        if (!startDir.endsWith(fspath.sep)) {
            startDir = fspath.join(startDir, fspath.sep);
        }

        // If the user has supplied 'false' for options.index, then no speciam index file served
        // at the root. Otherwise if they've supplied an actual filename to serve as the index
        // file then use what they've provided.  Otherwise attempt to serve "index.html" at the
        // root (if it exists).
        const indexFile = directory.index === false
            ? undefined
            : typeof directory.index === "string"
                ? directory.index
                : "index.html";

        const indexPath = indexFile === undefined ? undefined : fspath.join(startDir, indexFile);

        // Recursively walk the directory provided, creating bucket objects for all the files we
        // encounter.
        function walk(dir: string) {
            const children = fs.readdirSync(dir);

            for (const childName of children) {
                const childPath = fspath.join(dir, childName);
                const stats = fs.statSync(childPath);

                if (stats.isDirectory()) {
                    walk(childPath);
                }
                else if (stats.isFile()) {
                    const childRelativePath = childPath.substr(startDir.length);
                    const childUrn = directoryKey + "/" + childRelativePath;

                    createBucketObject(childUrn, childPath);

                    if (childPath === indexPath) {
                        // We hit the file that we also want to serve as the index file. Create
                        // a specific swagger path from the server root path to it.
                        swagger.paths[directoryServerPath] = {
                            [method]: createSwaggerOperationForObjectKey(childUrn, role),
                        };
                    }
                }
            }
        }

        walk(startDir);

        // Take whatever path the client wants to host this folder at, and add the
        // greedy matching predicate to the end.
        const proxyPath = directoryServerPath + "{proxy+}";
        addSwaggerOperation(swagger, proxyPath, swaggerMethod("ANY"), createSwaggerOperationForObjectKey(directoryKey, role, "proxy"));
    }

    function createSwaggerOperationForObjectKey(
            objectKey: string,
            role: aws.iam.Role,
            pathParameter?: string): SwaggerOperation {

        const region = aws.config.requireRegion();

        const uri = bucket!.bucket.apply(bucketName =>
            `arn:aws:apigateway:${region}:s3:path/${bucketName}/${objectKey}${(pathParameter ? `/{${pathParameter}}` : ``)}`);

        const result: SwaggerOperation = {
            responses: {
                "200": {
                    description: "200 response",
                    schema: { type: "object" },
                    headers: {
                        "Content-Type": { type: "string" },
                        "content-type": { type: "string" },
                    },
                },
                "400": {
                    description: "400 response",
                },
                "500": {
                    description: "500 response",
                },
            },
            "x-amazon-apigateway-integration": {
                credentials: role.arn,
                uri: uri,
                passthroughBehavior: "when_no_match",
                httpMethod: "GET",
                type: "aws",
                responses: {
                    "4\\d{2}": {
                        statusCode: "400",
                    },
                    "default": {
                        statusCode: "200",
                        responseParameters: {
                            "method.response.header.Content-Type": "integration.response.header.Content-Type",
                            "method.response.header.content-type": "integration.response.header.content-type",
                        },
                    },
                    "5\\d{2}": {
                        statusCode: "500",
                    },
                },
            },
        };

        if (pathParameter) {
            result.parameters = [{
                name: pathParameter,
                in: "path",
                required: true,
                type: "string",
            }];

            result["x-amazon-apigateway-integration"].requestParameters = {
                [`integration.request.path.${pathParameter}`]: `method.request.path.${pathParameter}`,
            };
        }

        return result;
    }
}

function addIntegrationRouteToSwaggerSpec(
    api: API, name: string, swagger: SwaggerSpec, route: IntegrationRoute) {

    checkRoute(api, route, "target");

    const target = isIntegrationRouteTargetProvider(route.target)
        ? pulumi.output(route.target.target(name + sha1hash(route.path), api))
        : pulumi.output(route.target);

    // Register two paths in the Swagger spec, for the root and for a catch all under the root
    const method = swaggerMethod("ANY");
    const swaggerPath = route.path.endsWith("/") ? route.path : route.path + "/";
    const swaggerPathProxy = swaggerPath + "{proxy+}";

    addSwaggerOperation(swagger, swaggerPath, method,
        createSwaggerOperationForProxy(target, /*useProxyPathParameter:*/ false));

    addSwaggerOperation(swagger, swaggerPathProxy, method,
        createSwaggerOperationForProxy(target, /*useProxyPathParameter:*/ true));

    return;

    function createSwaggerOperationForProxy(
        target: pulumi.Output<pulumi.Unwrap<IntegrationTarget>>,
        useProxyPathParameter: boolean): SwaggerOperation {

        const uri = target.apply(t => {
            let result = t.uri;
            // ensure there is a trailing `/`
            if (!result.endsWith("/")) {
                result += "/";
            }

            if (useProxyPathParameter) {
                result += "{proxy}";
            }

            return result;
        });

        const connectionType = target.apply(t => t.connectionType);
        const connectionId = target.apply(t => t.connectionId);
        const type = target.apply(t => t.type === undefined ? "http_proxy" : t.type);
        const passthroughBehavior = target.apply(t => t.passthroughBehavior === undefined ? "when_no_match" : t.passthroughBehavior);

        const result: SwaggerOperation = {
            "x-amazon-apigateway-integration": {
                responses: {
                    default: {
                        statusCode: "200",
                    },
                },
                uri,
                type,
                connectionType,
                connectionId,
                passthroughBehavior,
                httpMethod: "ANY",
            },
        };
        if (useProxyPathParameter) {
            result.parameters = [{
                name: "proxy",
                in: "path",
                required: true,
                type: "string",
            }];
            result["x-amazon-apigateway-integration"].requestParameters = {
                "integration.request.path.proxy": "method.request.path.proxy",
            };
        }
        return result;
    }
}

function addRawDataRouteToSwaggerSpec(
    api: API, name: string, swagger: SwaggerSpec, route: RawDataRoute) {

    checkRoute(api, route, "data");
    checkRoute(api, route, "method");

    // Simply take the [data] part of the route and place it into the correct place in the
    // swagger spec "paths" location.
    addSwaggerOperation(swagger, route.path, swaggerMethod(route.method), route.data);
}

function swaggerMethod(method: Method): string {
    switch (method.toLowerCase()) {
        case "get":
        case "put":
        case "post":
        case "delete":
        case "options":
        case "head":
        case "patch":
            return method.toLowerCase();
        case "any":
            return "x-amazon-apigateway-any-method";
        default:
            throw new Error("Method not supported: " + method);
    }
}

const apigatewayAssumeRolePolicyDocument = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "",
            "Effect": "Allow",
            "Principal": {
                "Service": "apigateway.amazonaws.com",
            },
            "Action": "sts:AssumeRole",
        },
    ],
};

function safeS3BucketName(apiName: string): string {
    return apiName.toLowerCase().replace(/[^a-z0-9\-]/g, "");
}
