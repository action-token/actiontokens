-- Holders list their own copies for resale: two order kinds and a storage account kind (additive).
ALTER TYPE "OrderKind" ADD VALUE 'RESALE_LIST';
ALTER TYPE "OrderKind" ADD VALUE 'RESALE_CANCEL';
ALTER TYPE "ChainAccountKind" ADD VALUE 'RESALE_STORAGE';
