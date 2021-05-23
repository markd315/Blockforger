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
- `$ref`: Overridden. You can only provide another schema filename from the folder as a subschema. Don't try to do anything recursive would be my advice ;) `"$ref": "latlong.json"` 
- `properties[n].apiCreationStrategy`: Not yet supported. The idea is to support multiple backend methods of creating objects with dependency relationships. Such as

1. Providing everything in one root payload and trusting the server to properly treat it as an aggregate with child objects (default way).
2. `childFirstBodyId` Creating the child first, then providing it to the parent as an id. The json response from the child POST ***must*** contain an id in the top-level.
3. `parentFirstRouteId`  Not implemented. Client creates the parent first, then creates the child using the id from the parent in a route for the child request.



This project is in working beta. Feature ideas below


- API authorization (client_credentials)
- Static typing for arrays
- Run the output json against the schema and flag noncompliance
- Use the additional validators in the schema files and flag for noncompliance (numeric out of range, etc)
- Implement common variations of apiCreationStrategy


References:

1. https://developers.google.com/blockly/

2. https://github.com/ens-lg4/MenulyJSON

3. http://jsonlogic.com/

4. Direct forked from https://github.com/katirasole/JSONLogic-Editor

