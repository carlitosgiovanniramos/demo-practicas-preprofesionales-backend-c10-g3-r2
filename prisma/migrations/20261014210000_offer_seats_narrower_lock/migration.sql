-- Estrecha el candado del trigger de cupos: FOR UPDATE -> FOR NO KEY UPDATE.
--
-- `FOR UPDATE` choca con el `FOR KEY SHARE` que Postgres toma sobre la oferta
-- cada vez que se inserta una postulación que la referencia por clave foránea.
-- Con eso, mientras una empresa acepta a alguien, cualquier estudiante que se
-- postule a esa misma oferta se queda esperando a que la aceptación confirme.
--
-- `FOR NO KEY UPDATE` no choca con `FOR KEY SHARE`, pero sí consigo mismo, que
-- es la única exclusión que hace falta aquí: lo que hay que serializar son las
-- aceptaciones entre ellas, no las aceptaciones contra las postulaciones.
--
-- Solo cambia el modo del candado. El resto de la función queda igual, así que
-- la garantía de D-08 no se toca: ver la migración `enforce_offer_seats`.

CREATE OR REPLACE FUNCTION enforce_offer_seats() RETURNS trigger AS $$
DECLARE
  capacity INTEGER;
  taken INTEGER;
BEGIN
  -- Solo cuando la postulación entra en ACCEPTED. Una que ya estaba aceptada no
  -- vuelve a ocupar plaza si se actualiza por cualquier otro motivo.
  IF NEW.status <> 'ACCEPTED' OR OLD.status = 'ACCEPTED' THEN
    RETURN NEW;
  END IF;

  SELECT seats INTO capacity FROM offers WHERE id = NEW."offerId" FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_seats_missing_offer: la oferta % no existe', NEW."offerId";
  END IF;

  -- Consulta aparte a propósito: bajo READ COMMITTED toma su propia instantánea,
  -- ya con lo que confirmó quien tenía el candado antes.
  SELECT count(*) INTO taken
  FROM applications
  WHERE "offerId" = NEW."offerId" AND status = 'ACCEPTED';

  IF taken >= capacity THEN
    RAISE EXCEPTION 'offer_seats_exhausted: la oferta % ya no tiene cupos', NEW."offerId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
