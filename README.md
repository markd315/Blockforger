Universal Drag-And-Drop Frontend
==============
Build complex REST json bodies easily utilizing Blockly, Menuly and [json-schema](https://json-schema.org/draft/2020-12/json-schema-core.html).

Pre-configure the data models that your API accepts, and the relationships between different classes.

Then, end-users can just drag and drop schema-defined blocks to wire together, validate, and send multiple API requests at once.

![Example](https://raw.githubusercontent.com/markd315/JSON-blockbuilder-frontend/master/example.png)

With Postman or other API requesting tools, you would have to configure these as three separate requests to three different endpoints! Jsonfrontend disambiguates and properly orders all of these requests for you, sending them with the click of a single button. It also ensures that your requests are entirely schema-compliant.

Universal Frontend makes it easy for your business analysts and any other low-tech users to use your API. All they need is the json-schema for the api, and their existing domain knowledge! No need to write new forms for every class!

### linux installation
```
sudo su -
yum install nodejs -y
npm install forever -g
npm install browserify -g
npm install
browserify public/main.js -o public/bundle.js
forever start -c "npm start" ./
```
see running app on frontend.zanzalaz.com

### Usage Instructions

1. Configure server.json for wherever your rest API backend is, and supply any credentials. You can also play around in the browser without configuring a valid server. The API Gateway is now configured with proper CORS headers, so no CORS proxy is needed.

2. Make any changes you want to the `schema`s in the folder. You will also have to list the new blocks under one of the menu categories at `index.html:72`, and add the file to the validator registry at line `main.js:39` See the bullets below on the additional feature-driving fields this project adds to the `json-schema` standard.

3. Install any missing dependencies `npm install` and make sure to do `npm install browserify -g` if you do not have browserify

4. Rebuild any changes into the bundle with `browserify public/main.js -o public/bundle.js`. It is important to run this whenever you change `main.js` or any of the schema files.

5. Start the application with: `npm start`

6. Open `http://localhost:8080` in the browser (tested with chrome)

### Recover lost work

Once you have started adding data to the canvas, the browser will automatically save your local work in local storage (ie, this feature will not work in incognito and data will not be backed up).

You can recover the tree by pressing the "Load Saved" button beneath the schema validation box.

One limitation of using this feature is that schema/type compliance will NOT be saved. The entire JSON object structure of your tree will be preserved, but any named object will be converted to a dictionary, and any array of primitives or named objects will be converted to a dynamic array.

Saving additional metadata about the tree is possible, but requires custom serialization work and provides limited value.

See below what happens to the "heat culture" example if you close the first example and reload it. All the data is the same, you can keep adding new data, send requests etc, but the schema compliance isn't enforced by the frontend anymore because the objects have completely lost their type context.

![The example above, in its recovered form](https://raw.githubusercontent.com/markd315/JSON-blockbuilder-frontend/master/recovery.png)

### Schema Definitions

The basic structure necessary is defined by [json schema](https://json-schema.org/draft/2020-12/json-schema-core.html). 


Plenty of examples come prepackaged with this project, using all of the new fields below.

The following additional fields specific to this product are also supported:
- `endpoint`: The name of the file defines the default endpoint (baseUrl + "/" + fileName). This allows you to override it.
- `default`: When we create a primitive (boolean, string, number) field for a block, spawn it with this value. Always give a string for this field, even if it is a numeric field. It will be casted to a numeric by the json processor later.
- `color`: The [HSV color](https://developers.google.com/blockly/guides/create-custom-blocks/block-colour#:~:text=%20Block%20colour%20%201%20Defining%20the%20block,space%20is%20highly%20recommended%2C%20but%20Blockly...%20More%20) for the blockly blocks in the browser
- `properties[n].$ref`: Overridden. You can only provide another schema filename from the folder as a subschema. Don't try to do anything recursive would be my advice ;) `"$ref": "location.json"` 
- `properties[n].apiCreationStrategy`: Multiple backend methods are supported for creating objects with dependency relationships. See below for the three supported ones.

1. Providing everything in one big payload and trusting the server to properly handle the data in the child objects (The default way, don't have to specify).
2. Providing the `childFirstBodyId` apiCreationStrategy override: Creating the child first, then providing it to the parent as an id. The json response from the child POST ***must*** contain an id in the top-level.
3. Providing the `parentFirstRouteId` apiCreationStrategy override. Client creates the parent first, then creates the child using the id from the parent POST in a route for the child request.
4. Providing the `parentFirstBodyId` apiCreationStrategy override, **and** the `childRefToParent` key in the property, specifying where in the child body to put the parent id. Client creates the parent first, then creates the child using the id from the parent POST in a specified field of the body for the child request. Note that you **must** provide both fields in order for this to work, like so. `"apiCreationStrategy": "parentFirstBodyId", "childRefToParent": "productId"`

Did I lose you there? See below for what's going on here and how this `apiCreationStrategy` really works and how powerful it is. It just allows the app to conform to the existing way your server handles composition relationships, I promise!

### Example schema with apiCreationStrategy overrides.

*Note that this example has no proper server, it is using a dummy api. Only the `employee` can ever return 200 because only the employee is supported by this dummy server. To see the example work by using mocked server responses, set `mockedResponses` to true in serverConfig.json*

In our example, you can build a tree like `product > location > employee` by using the optional fields in the dropdowns.
The same product can also have a list of employees.
```
product > location > employee (manager)
        > designers list > employee (designer)
                         > employee
                         > employee
```

Simply drag and drop a product into the "Root" node. Then, add the optional "warehouseLocation" via the `product` dropdown. Finally, add the optional field "manager" via the `location` dropdown.

Change whichever primitive fields you like, and add any other additional optional fields that you want sent.

Then click POST. Here's what requests the browser ends up sending, in what order, and why:

1. Because `product.warehouseLocation` has `"apiCreationStrategy": "parentFirstRouteId"`, the product is created first with no warehouse at all. An id must returned by the server. It is stored.

```
curl 'http://dummy.restapiexample.com/api/v1/product' \
  -H 'Authorization: eyJ...' \
  -H 'Content-type: application/json' \
  --data-raw '{"productId":1,"productName":"Fanta","price":3.41}'
```
response:
```
{"id" : "3302372d-a590-4c4b-b3e2-c070025a3b8e"}
```

2. If you added a list of designers to the product, they will be created now, one request for each. This could also happen after the creation of the location and manager, since the location and designers have no relationship to eachother except through the shared parent `product`: they are independent. We don't need to save the ids for anything, but we do need to use the productId from before. The difference from the prior requests is that we need to provide the product ID so that these employees will have a direct reference to their parent. The definition
```
"apiCreationStrategy": "parentFirstBodyId",
"childRefToParent": "productId"
```
means that we must do this in the body, and provide the id in a field called `productId`.
```
curl 'http://dummy.restapiexample.com/api/v1/create' \
  -H 'Authorization: eyJ...' \
  -H 'Content-type: application/json' \
  --data-raw '{"name":"Bill","salary":"72000","age":"44", "productId": "3302372d-a590-4c4b-b3e2-c070025a3b8e"}'
```

response:
```
{"id" : "bf02372d-a590-4c4b-b3e2-c070025a3b8e"}
(could be multiple depending on array length)
```

3. Location is not created next, because its `manager` field has `"apiCreationStrategy": "childFirstBodyId"`.
Instead, the employee must first created to be the manager of this warehouse. Once again, an id must be returned by the server, and is stored.
`endpoint` is also overridden, so the only unique thing to observe about this request is that the route changes, instead of `http://dummy.restapiexample.com/api/v1/employee` we use `http://dummy.restapiexample.com/api/v1/create`

```
curl 'http://dummy.restapiexample.com/api/v1/create' \
  -H 'Authorization: eyJ...' \
  -H 'Content-type: application/json' \
  --data-raw '{"name":"Bill","salary":"72000","age":"44"}'
```
response:
```
{"id" : "2f02372d-a590-4c4b-b3e2-c070025a3b8e"}
```

4. Now, the location (warehouse location) can finally be created with references to both of the previously stored ids.
As specified, the product is provided in the route of the POST, and the id of the managing employee is provided in the body like so:
```
curl 'http://dummy.restapiexample.com/api/v1/product/3302372d-a590-4c4b-b3e2-c070025a3b8e/location' \
  -H 'Authorization: eyJ...' \
  -H 'Content-type: application/json' \
  --data-raw '{"latitude":30.09,"longitude":-81.62,"manager":"2f02372d-a590-4c4b-b3e2-c070025a3b8e"}'
```
response:
```
{"id" : "af02372d-a590-4c4b-b3e2-c070025a3b8e"}
```

### Feature ideas

- Add explicit schema inheritance via `"allOf": []`
- Dark theme for the UI (pain because this apparently involves updating my blockly version)


References:

1. https://developers.google.com/blockly/

2. https://github.com/ens-lg4/MenulyJSON

3. http://jsonlogic.com/

4. Direct forked from https://github.com/katirasole/JSONLogic-Editor

