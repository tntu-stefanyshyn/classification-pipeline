import 'reflect-metadata';
import { buildAppSchema } from '../src/schema';

// Writes backend/schema.gql without starting the server or connecting to MongoDB.
buildAppSchema('schema.gql');
