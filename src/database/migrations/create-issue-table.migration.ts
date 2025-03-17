import { MigrationInterface, QueryRunner } from 'typeorm';

export default class AddIssuesTableAndRepoRelation
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "issue" (
        "id" VARCHAR PRIMARY KEY NOT NULL,
        "assignee" VARCHAR NULL,
        "assignees" JSONB DEFAULT '[]'::jsonb,
        "labels" JSONB DEFAULT '[]'::jsonb,
        "weight" INT DEFAULT 0 NOT NULL,
        "repoId" VARCHAR NULL,
        CONSTRAINT "FK_repo_issue" FOREIGN KEY ("repoId") REFERENCES "repo"("id") ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "repo" ADD COLUMN "issues" JSONB DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "repo" DROP COLUMN "issues";
    `);

    await queryRunner.query(`
      DROP TABLE "issue";
    `);
  }
}
