import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Variables inyectadas desde Supabase Secrets
const MY_PHONE_NUMBER = Deno.env.get("MY_PHONE_NUMBER");
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

// Variables automáticas de Supabase
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  const url = new URL(req.url);

  // 1. Verificación Inicial de Meta / WhatsApp (GET)
  // Cuando configuras el webhook en Meta, ellos envían un GET para verificar que este servidor es tuyo.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden: Token incorrecto", { status: 403 });
  }

  // 2. Recepción de Mensajes de WhatsApp (POST)
  if (req.method === "POST") {
    try {
      const body = await req.json();

      // Verificar que es un evento válido de WhatsApp
      if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0]?.value;
        const message = change?.messages?.[0];

        // Si es un mensaje de texto real
        if (message && message.type === "text") {
          const from = message.from; // Número de quien envía
          const text = message.text.body; // El contenido del mensaje

          // Verificar que el mensaje venga de TU número personal (seguridad)
          if (from === MY_PHONE_NUMBER) {
            
            // Insertar el nuevo texto en la tabla de Supabase
            const { error } = await supabase
              .from("contenido_web")
              .insert([{ mensaje: text }]);

            if (error) {
              console.error("Error al guardar en Supabase:", error);
              throw error;
            }
          } else {
            console.log(`Mensaje ignorado, proveniente de número no autorizado: ${from}`);
          }
        }
      }
      
      // Siempre debemos responder 200 a WhatsApp para que no reintente el envío infinitamente
      return new Response("EVENT_RECEIVED", { status: 200 });
      
    } catch (err) {
      console.error("Error procesando Webhook:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
