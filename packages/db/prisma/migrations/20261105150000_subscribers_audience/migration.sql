-- Subscribers: a new audience between followers and a membership tier (additive).
ALTER TYPE "PostAudience" ADD VALUE 'SUBSCRIBERS';
ALTER TYPE "Visibility" ADD VALUE 'SUBSCRIBERS';
