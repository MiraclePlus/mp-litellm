-- CreateTable
CREATE TABLE "LiteLLM_IdentityEval"
(
    "id"         SERIAL       NOT NULL,
    "model_id"   TEXT         NOT NULL,
    "dataset_name"   TEXT         NOT NULL,
    "metric"   TEXT         NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiteLLM_IdentityEval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiteLLM_IdentityEval_model_id_date_key" ON "LiteLLM_IdentityEval"("model_id","date");
