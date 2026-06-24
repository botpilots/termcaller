import { defineConfig } from '@prisma/config'

export default defineConfig({
  earlyAccess: true,
  migrations: {
    directory: 'prisma/migrations',
    schemaPath: 'prisma/schema.prisma',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'file:./database.sqlite',
  }
})
