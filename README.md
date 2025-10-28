Universal Drag-And-Drop Frontend
==============
Build complex REST json bodies easily utilizing Blockly, Menuly and [json-schema](https://json-schema.org/draft/2020-12/json-schema-core.html).

Pre-configure the data models that your API accepts, and the relationships between different classes.

Then, end-users can just drag and drop schema-defined blocks to wire together, validate, and send multiple API requests at once.

![Example](https://raw.githubusercontent.com/markd315/Blockforger/master/media/example.png)

With Postman or other API requesting tools, you would have to configure these as three separate requests to three different endpoints! Jsonfrontend disambiguates and properly orders all of these requests for you, sending them with the click of a single button. It also ensures that your requests are entirely schema-compliant.

Universal Frontend makes it easy for your business analysts and any other low-tech users to use your API. All they need is the json-schema for the api, and their existing domain knowledge! No need to write new forms for every class!

![API Controls](https://raw.githubusercontent.com/markd315/Blockforger/master/media/api-controls.png)

[Elevator pitch](https://www.youtube.com/watch?v=V9E9mX90yRI)

[Billing and integration example](https://www.youtube.com/watch?v=KOyfpMpG9Cg)

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

sudo netstat -tulpn | grep -E '8080|3030'
# Check if app is running on ports 8080 and 3030

### Usage Instructions

1. Configure server.json for wherever your rest API backend is, and supply any credentials. You can also play around in the browser without configuring a valid server. The API Gateway is now configured with proper CORS headers, so no CORS proxy is needed.

2. Make any changes you want to the `schema`s in the folder. You will also have to list the new blocks under one of the menu categories at `index.html:72`, and add the file to the validator registry at line `main.js:39` See the bullets below on the additional feature-driving fields this project adds to the `json-schema` standard.

3. Install any missing dependencies `npm install` and make sure to do `npm install browserify -g` if you do not have browserify

4. Rebuild any changes into the bundle with `browserify public/main.js -o public/bundle.js`. It is important to run this whenever you change `main.js` or any of the schema files.

5. Start the application with: `npm start`

6. Open `http://localhost:8080` in the browser (tested with chrome)

### Save and recover work.

You can recover the tree or load new data from the json pane into both the url bar and block pane with the button 🔗🧩 Rebuild link+blocks from JSON. Shareable links will generate from this for reasonably sized objects! Browser storage will be used for extremely large objects.


### Schema Definitions

The basic structure necessary is defined by [json schema](https://json-schema.org/draft/2020-12/json-schema-core.html).


Plenty of examples come prepackaged with this project, using all of the new fields below.

The following additional fields specific to this product are also supported:
- `endpoint`: The name of the file defines the default endpoint (baseUrl + "/" + fileName). This allows you to override it.
- `default`: When we create a primitive (boolean, string, number) field for a block, spawn it with this value. Always give a string for this field, even if it is a numeric field. It will be casted to a numeric by the json processor later.
- `color`: The [HSV color](https://developers.google.com/blockly/guides/create-custom-blocks/block-colour#:~:text=%20Block%20colour%20%201%20Defining%20the%20block,space%20is%20highly%20recommended%2C%20but%20Blockly...%20More%20) for the blockly blocks in the browser
- `properties[n].$ref`: Overridden. You can only provide another schema filename from the folder as a subschema. Don't try to do anything recursive would be my advice ;) `"$ref": "location.json"` 
- `endpointDescriptions`: Documentation field, follows a specific json format. See what the swagger ingestion processes an api into if you need the format.
- `endpoints`: Supported HTTP verbs and endpoints for this datatype. IN and OUT will add helpful query/save emojis to help the user understand if the request is something that will tend to GENERATE blocks or PERSIST blocks (generally a POST is an IN, a search is an OUT, but this is detected from API docs).
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



[Comment blocks example](https://blockforger.zanzalaz.com/?tenant=airline-customer&comment=[%22This%20is%20instructions%20to%20your%20end%20users%20on%20how%20to%20use%20the%20page.%22,%22If%20you%20see%20this%20you%20correctly%20added%20a%20comment!%22])


[Initial value example](https://blockforger.zanzalaz.com/index.html?tenant=petstore&queryParams=%257B%2522status%2522%253A%2522sold%2522%257D&initial=%5B%7B%22name%22%3A%22Dog+2%22%2C%22photoUrls%22%3A%5B%22https%3A%2F%2Fimages.pexels.com%2Fphotos%2F1108099%2Fpexels-photo-1108099.jpeg%22%5D%2C%22id%22%3A5%2C%22category%22%3A%7B%22id%22%3A1%2C%22name%22%3A%22Dogs%22%7D%2C%22tags%22%3A%5B%7B%22id%22%3A1%2C%22name%22%3A%22tag2%22%7D%2C%7B%22id%22%3A2%2C%22name%22%3A%22tag3%22%7D%5D%2C%22status%22%3A%22sold%22%7D%5D&rootSchema=pet_array)



References:

1. https://developers.google.com/blockly/

2. Forked from https://github.com/katirasole/JSONLogic-Editor during ancient history (pre-2021)

To deploy the petclinic example (urls may not match up to the schema if not fresh!)

```
sudo apt-get install docker.io -y
sudo apt-get upgrade -y
sudo docker pull swaggerapi/petstore
sudo docker run -d -e SWAGGER_HOST=http://petstore.zanzalaz.com:3030 \
  -e SWAGGER_URL=https://blockforger.zanzalaz.com \
  -e SWAGGER_BASE_PATH=/v2 -p 3030:8080 swaggerapi/petstore
sudo docker run -p 3030:8080 -t --name swagger-petstore swaggerapi/petstore&
```

kill with
```
sudo docker kill swaggerapi/petstore
sudo docker rm swaggerapi/petstore
```

Ensure the SG will allow traffic into 3030!

Test request
```
curl.exe ^"http://ec2-52-87-197-230.compute-1.amazonaws.com:3030/owners^" ^
  -X POST ^
  -H ^"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0^" ^
  -H ^"Accept: application/json, text/plain, */*^" ^
  -H ^"Accept-Language: en-US,en;q=0.5^" ^
  -H ^"Accept-Encoding: gzip, deflate^" ^
  -H ^"Cache-Control: no-cache^" ^
  -H ^"Content-Type: application/json;charset=utf-8^" ^
  -H ^"Origin: http://ec2-52-87-197-230.compute-1.amazonaws.com:3030^" ^
  -H ^"Connection: keep-alive^" ^
  -H ^"Referer: http://ec2-52-87-197-230.compute-1.amazonaws.com:3030/^" ^
  -H ^"Priority: u=0^" ^
  --data-raw ^"^{^\^"firstName^\^":^\^"mark^\^",^\^"lastName^\^":^\^"davis^\^",^\^"address^\^":^\^"8123893 madison^\^",^\^"city^\^":^\^"sacksonville^\^",^\^"telephone^\^":^\^"0^\^"^}^"
  ```
  