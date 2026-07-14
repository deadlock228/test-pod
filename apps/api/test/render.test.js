import { test } from "node:test";
import assert from "node:assert/strict";
import { renderString, renderTemplate } from "../src/templates/render.js";

test("renderString sustituye variables {{var}}", () => {
  assert.equal(renderString("Hola {{nombre}}", { nombre: "Ana" }), "Hola Ana");
});

test("renderString tolera espacios internos y claves anidadas", () => {
  const out = renderString("{{ contacto.nombre }}", { contacto: { nombre: "Leo" } });
  assert.equal(out, "Leo");
});

test("renderString reemplaza variables ausentes por cadena vacia", () => {
  assert.equal(renderString("Hola {{nombre}}!", {}), "Hola !");
});

test("renderTemplate renderiza subject, body_html y body_text", () => {
  const rendered = renderTemplate(
    {
      subject: "Bienvenido {{nombre}}",
      body_html: "<p>Hola {{nombre}}</p>",
      body_text: "Hola {{nombre}}",
    },
    { nombre: "Ana" },
  );
  assert.deepEqual(rendered, {
    subject: "Bienvenido Ana",
    body_html: "<p>Hola Ana</p>",
    body_text: "Hola Ana",
  });
});
