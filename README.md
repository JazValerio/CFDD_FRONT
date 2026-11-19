# Cocinita Desmonteña — Sistema de cobro

Interfaz web para el sistema de ventas y gestión del puesto. Incluye inicio de
sesión, resumen diario, registro de comandas, catálogo de productos, historial
de ventas y administración de vendedores para usuarios con rol administrador.

## Requisitos

- Node.js 20 o superior.
- API del backend ejecutándose (por defecto en `http://localhost:3000`).

## Ejecutar localmente

Desde esta carpeta:

1. Instala dependencias con `npm install`.
2. Opcionalmente, copia `.env.example` a `.env` y ajusta `VITE_API_URL` si la
   API no está en `http://localhost:3000`.
3. Inicia el servidor de desarrollo con `npm run dev`.
4. Abre la dirección que muestra Vite, normalmente `http://localhost:5173`.

El backend debe permitir el origen del frontend en `FRONTEND_URL`. En desarrollo
local se permiten `http://localhost:5173` y `http://127.0.0.1:5173`.

## Compilar

Ejecuta `npm run build`. El sitio compilado queda en `dist/` y se puede probar
localmente con `npm run preview`.

## Funcionalidades

- Acceso con las credenciales creadas por administración.
- Panel con resumen de ventas del día y comandas recientes.
- Registro de ventas con nombre obligatorio del cliente, cantidades, efectivo o SINPE Móvil, vuelto y notas.
- Consulta del catálogo; administradores pueden crear, editar y cambiar la
  disponibilidad de productos.
- Historial filtrable por fechas y vendedor.
- Administración de cuentas, roles y estado de vendedores para administradores.

Los precios se presentan en colones costarricenses (CRC). La API calcula y
valida los importes de las comandas; el cliente solo muestra el cálculo previo
para agilizar la atención.
