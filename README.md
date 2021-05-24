JSON Block-Style Frontend
==============
Built complex REST json bodies automatically utilizing Blockly and [json-schema](https://json-schema.org/draft/2020-12/json-schema-core.html). All supported operations in JSONLogic structure are provided by Blockly blocks. 

Pre-configure the data models that your API accepts, and the relationships between different endpoints.
Then, users can just drag and drop schema-defined blocks to wire together and send multiple API requests at once.


### Instructions


1. Configure server.json for wherever your rest API backend is. Currently only basic_auth is supported. You can also play around in the browser without configuring a valid server.

2. Make any changes you want to the schemas in the eponymous folder. You will also have to list the new blocks under one of the menu categories at `index.html:170`. See the bullets below on the additional fields this project adds.

3. Start the ***schema*** server with: `python schemaserver.py 8888` ***This is not the same as the backend server***. This is mandatory to serve all of the json files to your browser since browsers cannot access local filesystems for security reasons. You can choose to host the files any other way you like too.

4. Open `file:///.../jsonfrontend/index.html` in the browser (tested with chrome)


The basic structure necessary is defined by [json schema](https://json-schema.org/draft/2020-12/json-schema-core.html). Additional fields specific to this product are also supported.

- `endpoint`: The name of the file defines the default endpoint (baseUrl + "/" + fileName). This allows you to override it.
- `color`: The [HSV color](https://developers.google.com/blockly/guides/create-custom-blocks/block-colour#:~:text=%20Block%20colour%20%201%20Defining%20the%20block,space%20is%20highly%20recommended%2C%20but%20Blockly...%20More%20) for the blockly blocks in the browser
- `$ref`: Overridden. You can only provide another schema filename from the folder as a subschema. Don't try to do anything recursive would be my advice ;) `"$ref": "location.json"` 
- `properties[n].apiCreationStrategy`: Multiple backend methods are supported for creating objects with dependency relationships. See below for the three supported ones.

1. Providing everything in one root payload and trusting the server to properly treat it as an aggregate with child objects (default way).
2. Providing the `childFirstBodyId` apiCreationStrategy override: Creating the child first, then providing it to the parent as an id. The json response from the child POST ***must*** contain an id in the top-level.
3. Providing the `parentFirstRouteId` apiCreationStrategy override. Client creates the parent first, then creates the child using the id from the parent in a route for the child request.

### Example schema with apiCreationStrategy overrides.

This tool allows you to build one tree that will spawn all necessary requests to the backend to create an entire tree of objects.

In our example, you can build a tree like `product > location > employee` by using the optional fields in the dropdowns.

Note that this example has no proper server, it is using a dummy api. Only the `employee` can ever return 200 because only the employee is supported by this dummy server. To see the example work by using mocked server responses, uncomment `index.html:166,171` and comment out `index.html:164,169` or checkout the `mockbadresponses` branch.

1. Because `product.warehouseLocation` has `"apiCreationStrategy": "parentFirstRouteId"`, the product is created first with no warehouse at all. An id must returned by the server. It is stored.

```

```

2. Location is not created next, because its `manager` field has `"apiCreationStrategy": "childFirstBodyId"`.
Instead, an employee is first created to be the manager of this warehouse. Once again, an id must be returned by the server, and is stored.
`endpoint` is also overridden, so the only unique thing to observe about this request is that the route changes, instead of `http://dummy.restapiexample.com/api/v1/employee` we use `http://dummy.restapiexample.com/api/v1/create`

```

```

3. Finally, the location (warehouse location) must be created with references to both of the previously stored ids.
As specified, the product is provided in the route of the POST, and the id of the managing employee is provided in the body like so:
```
curl 'http://dummy.restapiexample.com/api/v1/product/3302372d-a590-4c4b-b3e2-c070025a3b8e/location' \
  -H 'Authorization: ...' \
  -H 'Content-type: application/json' \
  --data-raw '{"latitude":0,"longitude":0,"manager":"2f02372d-a590-4c4b-b3e2-c070025a3b8e"}' \
  --compressed
```


Feature ideas:

- Static typing for arrays
- Run the output json against the schema and flag noncompliance
- Use the additional validators in the schema files and flag for noncompliance (numeric out of range, etc)


References:

1. https://developers.google.com/blockly/

2. https://github.com/ens-lg4/MenulyJSON

3. http://jsonlogic.com/

4. Direct forked from https://github.com/katirasole/JSONLogic-Editor

