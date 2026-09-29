import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{code:text('code').primaryKey(),data:text('data').notNull(),version:integer('version').notNull().default(0),created:integer('created').notNull()});
export const sessions=sqliteTable('sessions',{id:text('id').primaryKey(),expires:integer('expires').notNull()});
export const rates=sqliteTable('rates',{id:text('id').primaryKey(),count:integer('count').notNull(),reset:integer('reset').notNull()});

export const images=sqliteTable('images',{id:text('id').primaryKey(),code:text('code').notNull(),data:text('data').notNull()});
