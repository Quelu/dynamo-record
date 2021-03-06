// @flow

import { DynamoDB } from "aws-sdk";
import { forEach, upperFirst, join, isArray, size } from "lodash";
import { type DynamoDBGetParams, type DynamoDBQueryParams } from "./types";

const assignConfig = (params: Object, config: Object): Object => {
  const paramsToReturn = { ...params };

  forEach(config, (value, key) => {
    paramsToReturn[upperFirst(key)] = value;
  });

  return paramsToReturn;
};

export class DynamoRecord {
  tableName: string;

  dynamoClient: DynamoDB.DocumentClient;

  constructor(tableName: string, tableRegion: string) {
    this.tableName = tableName;

    this.dynamoClient = new DynamoDB.DocumentClient({
      tableRegion
    });
  }

  /**
   * find() return one item based on his primary key.
   * @param {*} primaryKey, an object with HASH and RANGE key.
   * @param {*} config, an object with params for the request. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#get-property)
   */
  find(primaryKey: Object, config?: Object): Promise<any> {
    return new Promise((resolve, reject) => {
      let params: DynamoDBGetParams = {
        TableName: this.tableName,
        Key: primaryKey,
        ConsistentRead: true,
        ReturnConsumedCapacity: "TOTAL"
      };

      if (config) {
        params = assignConfig(params, config);
      }

      this.dynamoClient.get(params, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * where() return items based on primary key.
   * @param {*} primaryKey, an object with HASH and RANGE key.
   * @param {*} config, an object with params for the request. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#query-property)
   */
  where(
    primaryKey?: Object,
    filterExpression?: Object,
    config?: Object
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let params: DynamoDBQueryParams = {
        TableName: this.tableName,
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {},
        ReturnConsumedCapacity: "TOTAL"
      };

      if (primaryKey) {
        const primaryKeyArray: string[] = [];

        // Create an array with each primary key part
        // Assign :key / value (data interpolation syntax from Dynamo) to ExpressionAttributeValues
        forEach(primaryKey, (value, key) => {
          params.ExpressionAttributeNames["#" + key] = key;
          // Between attributes
          if (isArray(value) && value.length === 2) {
            primaryKeyArray.push(`#${key} BETWEEN :${key}Start AND :${key}End`);
            value.forEach((v, k) => {
              if (k === 0) {
                params.ExpressionAttributeValues[":" + key + "Start"] = v;
              } else if (k === 1) {
                params.ExpressionAttributeValues[":" + key + "End"] = v;
              }
            });
          } else {
            primaryKeyArray.push(`#${key} = :${key}`);
            params.ExpressionAttributeValues[":" + key] = value;
          }
        });

        // Join with 'AND' each primary key part
        params.KeyConditionExpression = join(primaryKeyArray, " AND ");
      }

      if (
        filterExpression &&
        filterExpression.condition &&
        filterExpression.keys
      ) {
        params.FilterExpression = filterExpression.condition;

        forEach(filterExpression.keys, (value, key) => {
          params.ExpressionAttributeNames["#" + key] = key;
          // Between attributes
          if (isArray(value) && value.length === 2) {
            value.forEach((v, k) => {
              if (k === 0) {
                params.ExpressionAttributeValues[":" + key + "Start"] = v;
              } else if (k === 1) {
                params.ExpressionAttributeValues[":" + key + "End"] = v;
              }
            });
          } else {
            params.ExpressionAttributeValues[":" + key] = value;
          }
        });
      }

      if (size(params.ExpressionAttributeNames) === 0) {
        delete params.ExpressionAttributeNames;
      }

      if (size(params.ExpressionAttributeValues) === 0) {
        delete params.ExpressionAttributeValues;
      }

      if (config) {
        params = assignConfig(params, config);
      }

      if (primaryKey) {
        // Directly access items from a table by primary key or a secondary index.
        this.dynamoClient.query(params, (error: any, data: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      } else {
        // Directly access items from a table without primary key or a secondary index.
        this.dynamoClient.scan(params, (error: any, data: any) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      }
    });
  }

  /**
   * getAll() return all items from table.
   * @param {*} config, an object with params for the request. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#scan-property)
   */
  getAll(config?: Object): Promise<any> {
    let params = {
      TableName: this.tableName,
      ReturnConsumedCapacity: "TOTAL"
    };

    if (config) {
      params = assignConfig(params, config);
    }

    return new Promise((resolve, reject) => {
      this.dynamoClient.scan(params, (error: any, data: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * create() add an item into table
   * @param {*} createData, data to store into table
   * @param {*} config, an object with params for the request. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#put-property)
   */
  create(createData: any, config?: Object): Promise<any> {
    return new Promise((resolve, reject) => {
      let params: any = {
        TableName: this.tableName,
        Item: createData
      };

      if (config) {
        params = assignConfig(params, config);
      }

      this.dynamoClient.put(params, (error: any, data: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * batchCreate() add items into table
   * @param {*} createData array of data to store into table max of 25 items
   * @param {*} config an object with params for the request. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#batchWriteItem-property)
   */
  batchCreate(createData: Object[], config?: Object): Promise<any> {
    return new Promise((resolve, reject) => {
      let params: Object = {
        RequestItems: {
          [this.tableName]: createData.map(item => ({
            PutRequest: { Item: item }
          }))
        }
      };

      if (config) {
        params = assignConfig(params, config);
      }

      this.dynamoClient.batchWrite(params, (error: any, data: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * update() an item into table based on his primary key.
   * @param {*} primaryKey
   * @param {*} updateData
   * @param {*} config
   */
  update(primaryKey: Object, updateData: any, config?: Object): Promise<any> {
    return new Promise((resolve, reject) => {
      let params: any = {
        TableName: this.tableName,
        Key: primaryKey,
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {},
        ReturnValues: "ALL_NEW"
      };

      if (updateData) {
        const updateExpression: string[] = [];

        // Create an array with each attributes (#key = :key)
        // Assign #key / key (data interpolation syntax from Dynamo) to ExpressionAttributeNames
        // Assign :key / value (data interpolation syntax from Dynamo) to ExpressionAttributeValues
        forEach(updateData, (value, key) => {
          updateExpression.push(`#${key} = :${key}`);
          params.ExpressionAttributeNames["#" + key] = key;
          params.ExpressionAttributeValues[":" + key] = value;
        });

        // Join with ',' each attributes
        params.UpdateExpression = `set ${join(updateExpression, ", ")}`;
      }

      if (config) {
        params = assignConfig(params, config);
      }

      this.dynamoClient.update(params, (error: any, data: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  destroy(primaryKey: Object, config?: Object): Promise<any> {
    return new Promise((resolve, reject) => {
      let params: any = {
        TableName: this.tableName,
        Key: primaryKey
      };

      if (config) {
        params = assignConfig(params, config);
      }

      this.dynamoClient.delete(params, (error: any, data: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }
}
