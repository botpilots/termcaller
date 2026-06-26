-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pdfPath" TEXT,
    "pageCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "sourceTerm" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "candidateConceptName" TEXT NOT NULL,
    "definitionText" TEXT NOT NULL,
    "vectorEmbedding" vector(768),
    "excludedFromExport" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Illustration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "figureNumber" TEXT NOT NULL DEFAULT '1',
    "title" TEXT,
    "imageUrl" TEXT,
    "validationResult" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Illustration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Callout" (
    "id" TEXT NOT NULL,
    "illustrationId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "actualIdentifier" TEXT,
    "sourceTerm" TEXT NOT NULL,
    "conceptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Callout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_KeywordConcepts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Concept_definitionHash_key" ON "Concept"("definitionHash");

-- CreateIndex
CREATE UNIQUE INDEX "Illustration_projectId_pageNumber_figureNumber_key" ON "Illustration"("projectId", "pageNumber", "figureNumber");

-- CreateIndex
CREATE UNIQUE INDEX "_KeywordConcepts_AB_unique" ON "_KeywordConcepts"("A", "B");

-- CreateIndex
CREATE INDEX "_KeywordConcepts_B_index" ON "_KeywordConcepts"("B");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Illustration" ADD CONSTRAINT "Illustration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Callout" ADD CONSTRAINT "Callout_illustrationId_fkey" FOREIGN KEY ("illustrationId") REFERENCES "Illustration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Callout" ADD CONSTRAINT "Callout_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KeywordConcepts" ADD CONSTRAINT "_KeywordConcepts_A_fkey" FOREIGN KEY ("A") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KeywordConcepts" ADD CONSTRAINT "_KeywordConcepts_B_fkey" FOREIGN KEY ("B") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
