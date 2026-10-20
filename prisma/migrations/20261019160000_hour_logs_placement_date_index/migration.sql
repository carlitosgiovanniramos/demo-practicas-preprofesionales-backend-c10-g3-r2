-- Libro de horas por práctica: listForPlacement filtra por "placementId" y ordena por "date".
-- Sin este índice, Postgres recorre toda la tabla (Seq Scan) y descarta las filas de otras prácticas.
CREATE INDEX "hour_logs_placementId_date_idx" ON "hour_logs"("placementId", "date");
