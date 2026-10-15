-- D-08: impedir que se acepten más postulaciones que cupos.
--
-- El límite deja de depender del código de aplicación. El trigger corre dentro
-- del mismo UPDATE que acepta la postulación, así que no hay ventana entre
-- comprobar y escribir: o la plaza existe en ese instante, o no se escribe.
--
-- Dos aceptaciones concurrentes sobre la misma oferta se serializan en el
-- `FOR UPDATE`: la segunda espera a que la primera confirme y solo entonces
-- cuenta, con lo que ya ve la plaza ocupada. El bloqueo es sobre la fila de la
-- oferta y no sobre las postulaciones, para que dos ofertas distintas no se
-- estorben.
--
-- Se vigila la transición a ACCEPTED y no la inserción: la API solo crea
-- postulaciones en SUBMITTED y aceptar es siempre un UPDATE. El seed sí inserta
-- aceptadas directamente, y hoy se pasa de los cupos; eso queda anotado en
-- KNOWN_ISSUES.md como hallazgo aparte y no lo arregla esta migración.

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

  SELECT seats INTO capacity FROM offers WHERE id = NEW."offerId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer_seats_missing_offer: la oferta % no existe', NEW."offerId";
  END IF;

  -- Consulta aparte a propósito: bajo READ COMMITTED toma su propia instantánea,
  -- ya con lo que confirmó quien tenía el bloqueo antes.
  SELECT count(*) INTO taken
  FROM applications
  WHERE "offerId" = NEW."offerId" AND status = 'ACCEPTED';

  IF taken >= capacity THEN
    RAISE EXCEPTION 'offer_seats_exhausted: la oferta % ya no tiene cupos', NEW."offerId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_enforce_offer_seats
BEFORE UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION enforce_offer_seats();
