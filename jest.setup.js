// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock Prisma Client for tests
jest.mock('@/lib/prisma', () => ({
  prisma: {
    fund: {
      findMany: jest.fn(),
    },
    holding: {
      findFirst: jest.fn(),
    },
  },
}))

