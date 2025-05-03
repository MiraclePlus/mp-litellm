-- CreateTable
CREATE TABLE "LiteLLM_IdentityEval"
(
    "id"         SERIAL       NOT NULL,
    "model_id"   TEXT         NOT NULL,
    "dataset_key" TEXT         NOT NULL,
    "dataset_name"   TEXT         NOT NULL,
    "metric"   TEXT         NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "subset" TEXT NOT NULL,
    "num" INTEGER NOT NULL,

    CONSTRAINT "LiteLLM_IdentityEval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
create unique index LiteLLM_IdentityEval_unique
    on public."LiteLLM_IdentityEval" (model_id, dataset_key, date);
