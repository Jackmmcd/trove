// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// A global jest.mock('@/lib/prisma', ...) used to live here. Prisma was removed
// in the move to Supabase, so the path no longer resolves and jest failed to
// load this file at all — which failed every suite before a single test ran.
// Tests that need the Supabase admin client should mock '@/lib/supabase/admin'
// themselves rather than reintroducing a global mock here.
