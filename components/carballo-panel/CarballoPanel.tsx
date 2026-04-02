"use client";

import { Bebas_Neue, Inter } from "next/font/google";
import type { User } from "@supabase/supabase-js";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bicicletasToDbField,
  getBicicletasList,
  inDateRange,
} from "@/lib/retiro-bicicletas";
import type { ServiceKanbanCol } from "@/lib/service-kanban";
import { serviceEstadoAfterDrop } from "@/lib/service-kanban";
import { supabaseCarballo as supabase } from "@/lib/supabase-carballo";
import "./carballo-panel.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });

const LOGO_URL =
  "https://z-cdn-media.chatglm.cn/files/3f361c98-0fd6-4185-af4e-04796eeb9a0f.png?auth_key=1875138020-fad777de9d324272b0cf74a814457c95-0-3274d383a74cce1f4818a67e3b1927d5";

type PanelKind = "retiro" | "service";
type Screen = "login" | "select" | "dashboard";

interface Row {
  id: number;
  cliente: string;
  telefono?: string | null;
  bicicleta: string;
  fecha: string;
  estado: string;
  trabajo?: string | null;
  bicicletas?: unknown;
  fecha_estimada_entrega?: string | null;
}

type RetiroColumnId = "pendiente" | "listo" | "entregado";

const RETIRO_COLUMN_META: { id: RetiroColumnId; title: string }[] = [
  { id: "pendiente", title: "Pendiente" },
  { id: "listo", title: "Listo para retirar" },
  { id: "entregado", title: "Entregado" },
];

const SERVICE_KANBAN_META: {
  id: ServiceKanbanCol;
  title: string;
  semaforoClass: "pendiente" | "listo" | "entregado";
}[] = [
  { id: "svc_ingreso", title: "Ingreso / Diagnostico", semaforoClass: "pendiente" },
  { id: "svc_reparacion", title: "En reparacion", semaforoClass: "listo" },
  { id: "svc_listo", title: "Listo para entregar", semaforoClass: "entregado" },
];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** PostgREST devuelve objetos con `message` que no siempre son `instanceof Error`. */
function postgrestErrorMessage(err: unknown): string {
  if (err !== null && typeof err === "object") {
    const o = err as { message?: string; details?: string; hint?: string };
    if (typeof o.message === "string" && o.message.length > 0) return o.message;
    if (typeof o.details === "string" && o.details.length > 0) return o.details;
    if (typeof o.hint === "string" && o.hint.length > 0) return o.hint;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Error desconocido";
}

function isMissingFechaEstimadaColumnError(err: unknown): boolean {
  const m = postgrestErrorMessage(err).toLowerCase();
  return (
    m.includes("fecha_estimada_entrega") ||
    (m.includes("column") && (m.includes("does not exist") || m.includes("schema cache")))
  );
}

export function CarballoPanel() {
  const [screen, setScreen] = useState<Screen>("login");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPanel, setCurrentPanel] = useState<PanelKind | null>(null);
  const [tableData, setTableData] = useState<Row[]>([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [fBicicletas, setFBicicletas] = useState<string[]>([""]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropCol, setDropCol] = useState<RetiroColumnId | null>(null);
  const [dropColService, setDropColService] = useState<ServiceKanbanCol | null>(null);
  const [fFechaEntrega, setFFechaEntrega] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [loginErrorMsg, setLoginErrorMsg] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [shakeLogin, setShakeLogin] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fCliente, setFCliente] = useState("");
  const [fTelefono, setFTelefono] = useState("");
  const [fBicicleta, setFBicicleta] = useState("");
  const [fFecha, setFFecha] = useState("");
  const [fTrabajo, setFTrabajo] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const [toasts, setToasts] = useState<{ id: number; message: string; type: "success" | "error" | "info" }[]>([]);
  const toastId = useRef(0);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  }, []);

  const userName = useMemo(() => {
    if (!currentUser?.email) return "Admin";
    return currentUser.email.split("@")[0];
  }, [currentUser]);

  const userInitial = userName.charAt(0).toUpperCase();

  const shakeCard = () => {
    setShakeLogin(true);
    setTimeout(() => setShakeLogin(false), 400);
  };

  const setupUserUI = (user: User) => {
    setCurrentUser(user);
  };

  const checkSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      setupUserUI(session.user);
      setScreen("select");
    } else {
      setScreen("login");
    }
  };

  useEffect(() => {
    checkSession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setCurrentPanel(null);
        setScreen("login");
      } else if (event === "SIGNED_IN" && session?.user) {
        setupUserUI(session.user);
        setScreen("select");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    const email = loginEmail.trim().toLowerCase();
    const pass = loginPass;
    if (!email || !pass) {
      setLoginErrorMsg("Completa email y contrasena");
      setLoginError(true);
      shakeCard();
      return;
    }
    setLoginError(false);
    setLoginBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) {
        setLoginErrorMsg(
          error.message === "Invalid login credentials"
            ? "Email o contrasena incorrectos"
            : error.message
        );
        setLoginError(true);
        shakeCard();
      } else if (data.user) {
        setCurrentUser(data.user);
        setupUserUI(data.user);
        setScreen("select");
      }
    } catch {
      setLoginErrorMsg("Error de conexion. Intenta de nuevo.");
      setLoginError(true);
      shakeCard();
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentPanel(null);
    setLoginEmail("");
    setLoginPass("");
    setLoginError(false);
    setScreen("login");
  };

  const goToSelect = () => {
    setCurrentPanel(null);
    setScreen("select");
  };

  const loadData = async (panel: PanelKind) => {
    setDashLoading(true);
    try {
      const table = panel === "retiro" ? "retiros" : "services";
      const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setTableData((data as Row[]) || []);
    } catch (e) {
      console.error(e);
      showToast("Error al cargar los datos", "error");
      setTableData([]);
    } finally {
      setDashLoading(false);
    }
  };

  const openDashboard = async (panel: PanelKind) => {
    setCurrentPanel(panel);
    setEditingId(null);
    setSearch("");
    setDropCol(null);
    setDropColService(null);
    if (panel === "retiro" || panel === "service") {
      const t = new Date();
      const hasta = t.toISOString().split("T")[0];
      const desde = new Date(t.getFullYear(), t.getMonth(), 1).toISOString().split("T")[0];
      setFechaDesde(desde);
      setFechaHasta(hasta);
    } else {
      setFechaDesde("");
      setFechaHasta("");
    }
    setScreen("dashboard");
    await loadData(panel);
  };

  const retiroFiltered = useMemo(() => {
    if (currentPanel !== "retiro") return [];
    const q = search.toLowerCase().trim();
    return tableData.filter((d) => {
      if (!inDateRange(d.fecha, fechaDesde, fechaHasta)) return false;
      if (!q) return true;
      const bikes = getBicicletasList(d)
        .join(" ")
        .toLowerCase();
      return (
        (d.cliente || "").toLowerCase().includes(q) ||
        bikes.includes(q) ||
        getBicicletasList(d).some((b) => b.toLowerCase().includes(q))
      );
    });
  }, [currentPanel, tableData, fechaDesde, fechaHasta, search]);

  const serviceFiltered = useMemo(() => {
    if (currentPanel !== "service") return [];
    const q = search.toLowerCase().trim();
    return tableData.filter((d) => {
      if (!inDateRange(d.fecha, fechaDesde, fechaHasta)) return false;
      if (!q) return true;
      return (
        (d.cliente || "").toLowerCase().includes(q) ||
        (d.bicicleta || "").toLowerCase().includes(q) ||
        (d.trabajo || "").toLowerCase().includes(q)
      );
    });
  }, [currentPanel, tableData, fechaDesde, fechaHasta, search]);

  const statsRow = useMemo(() => {
    if (!currentPanel) return null;
    if (currentPanel === "retiro") {
      const pendientes = retiroFiltered.filter((d) => d.estado === "pendiente").length;
      const listos = retiroFiltered.filter((d) => d.estado === "listo").length;
      const entregados = retiroFiltered.filter((d) => d.estado === "entregado").length;
      return (
        <>
          <div className="stat-card stat-card--total">
            <span className="stat-label">Total Retiros</span>
            <span className="stat-value">{retiroFiltered.length}</span>
          </div>
          <div className="stat-card stat-card--semaforo-rojo">
            <span className="stat-label">Pendientes</span>
            <span className="stat-value">{pendientes}</span>
          </div>
          <div className="stat-card stat-card--semaforo-amarillo">
            <span className="stat-label">Listos para Retirar</span>
            <span className="stat-value">{listos}</span>
          </div>
          <div className="stat-card stat-card--semaforo-verde">
            <span className="stat-label">Entregados</span>
            <span className="stat-value">{entregados}</span>
          </div>
        </>
      );
    }
    const ingresoDiag = serviceFiltered.filter(
      (d) => d.estado === "ingresada" || d.estado === "diagnostico"
    ).length;
    const reparacion = serviceFiltered.filter((d) => d.estado === "en_reparacion").length;
    const listos = serviceFiltered.filter((d) => d.estado === "listo").length;
    return (
      <>
        <div className="stat-card stat-card--total">
          <span className="stat-label">Total Services</span>
          <span className="stat-value">{serviceFiltered.length}</span>
        </div>
        <div className="stat-card stat-card--semaforo-rojo">
          <span className="stat-label">Ingreso / Diagnostico</span>
          <span className="stat-value">{ingresoDiag}</span>
        </div>
        <div className="stat-card stat-card--semaforo-amarillo">
          <span className="stat-label">En reparacion</span>
          <span className="stat-value">{reparacion}</span>
        </div>
        <div className="stat-card stat-card--semaforo-verde">
          <span className="stat-label">Listos para entregar</span>
          <span className="stat-value">{listos}</span>
        </div>
      </>
    );
  }, [currentPanel, tableData, retiroFiltered, serviceFiltered]);

  const changeStatus = async (id: number, newStatus: string) => {
    if (!currentPanel) return;
    const table = currentPanel === "retiro" ? "retiros" : "services";
    const labels: Record<string, string> = {
      pendiente: "Pendiente",
      listo: "Listo",
      entregado: "Entregado",
      ingresada: "Ingresada",
      diagnostico: "Diagnostico",
      en_reparacion: "En reparacion",
    };
    try {
      const { error } = await supabase.from(table).update({ estado: newStatus }).eq("id", id);
      if (error) throw error;
      setTableData((rows) => rows.map((r) => (r.id === id ? { ...r, estado: newStatus } : r)));
      showToast(`Estado cambiado a "${labels[newStatus] || newStatus}"`, "success");
    } catch (err) {
      console.error(err);
      showToast("Error al cambiar el estado", "error");
    }
  };

  const openAddModal = () => {
    if (!currentPanel) return;
    setEditingId(null);
    const today = new Date().toISOString().split("T")[0];
    setFCliente("");
    setFTelefono("");
    setFBicicleta("");
    setFBicicletas([""]);
    setFFecha(today);
    setFFechaEntrega("");
    setFTrabajo("");
    setFEstado("");
    setModalOpen(true);
  };

  const openEditModal = (id: number) => {
    const item = tableData.find((d) => d.id === id);
    if (!item || !currentPanel) return;
    setEditingId(id);
    setFCliente(item.cliente);
    setFTelefono(item.telefono || "");
    if (currentPanel === "retiro") {
      const bikes = getBicicletasList(item);
      setFBicicletas(bikes.length ? bikes : [""]);
      setFBicicleta("");
    } else {
      setFBicicleta(item.bicicleta);
    }
    setFFecha(item.fecha.split("T")[0]);
    setFFechaEntrega(item.fecha_estimada_entrega?.split("T")[0] ?? "");
    setFTrabajo(item.trabajo || "");
    setFEstado(item.estado);
    setModalOpen(true);
  };

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
  }, []);

  const saveRecord = async () => {
    if (!currentPanel) return;
    const cliente = fCliente.trim();
    const telefono = fTelefono.trim();
    const fecha = fFecha;
    if (!cliente) {
      showToast("Completa el nombre del cliente", "error");
      return;
    }
    if (!fecha) {
      showToast("Completa la fecha", "error");
      return;
    }

    let bicicletaField: string;
    if (currentPanel === "retiro") {
      const bikes = fBicicletas.map((s) => s.trim()).filter(Boolean);
      if (bikes.length === 0) {
        showToast("Agrega al menos una bicicleta", "error");
        return;
      }
      bicicletaField = bicicletasToDbField(bikes);
    } else {
      const bicicleta = fBicicleta.trim();
      if (!bicicleta) {
        showToast("Completa la bicicleta", "error");
        return;
      }
      bicicletaField = bicicleta;
    }

    const table = currentPanel === "retiro" ? "retiros" : "services";
    setSaveBusy(true);
    try {
      if (editingId !== null) {
        const payload: Record<string, unknown> = {
          cliente,
          telefono,
          bicicleta: bicicletaField,
          fecha,
        };
        if (fEstado) payload.estado = fEstado;
        let serviceSavedWithoutFechaColumn = false;
        if (currentPanel === "service") {
          payload.trabajo = fTrabajo.trim();
          payload.fecha_estimada_entrega = fFechaEntrega || null;
        }
        let { error } = await supabase.from(table).update(payload).eq("id", editingId);
        if (
          error &&
          currentPanel === "service" &&
          isMissingFechaEstimadaColumnError(error) &&
          "fecha_estimada_entrega" in payload
        ) {
          const { fecha_estimada_entrega: _f, ...withoutFecha } = payload;
          const retry = await supabase.from(table).update(withoutFecha).eq("id", editingId);
          error = retry.error;
          if (!error) {
            delete payload.fecha_estimada_entrega;
            serviceSavedWithoutFechaColumn = true;
            showToast(
              "Registro actualizado. La fecha estimada no se guardó hasta que agregues la columna en Supabase (scripts/add-fecha-estimada-entrega.sql).",
              "info"
            );
          }
        }
        if (error) throw error;
        setTableData((rows) =>
          rows.map((r) =>
            r.id === editingId
              ? ({
                  ...r,
                  ...payload,
                  trabajo: currentPanel === "service" ? fTrabajo.trim() : r.trabajo,
                  fecha_estimada_entrega:
                    currentPanel === "service" && "fecha_estimada_entrega" in payload
                      ? (payload.fecha_estimada_entrega as string | null)
                      : r.fecha_estimada_entrega,
                } as Row)
              : r
          )
        );
        if (!serviceSavedWithoutFechaColumn) {
          showToast("Registro actualizado correctamente", "success");
        }
      } else {
        const payload: Record<string, unknown> = {
          cliente,
          telefono,
          bicicleta: bicicletaField,
          fecha,
          estado: currentPanel === "retiro" ? "pendiente" : "ingresada",
        };
        let insertSavedWithoutFechaColumn = false;
        if (currentPanel === "service") {
          payload.trabajo = fTrabajo.trim() || "Sin descripcion";
          payload.fecha_estimada_entrega = fFechaEntrega || null;
        }
        let { data, error } = await supabase.from(table).insert(payload).select().single();
        if (
          error &&
          currentPanel === "service" &&
          isMissingFechaEstimadaColumnError(error) &&
          "fecha_estimada_entrega" in payload
        ) {
          const { fecha_estimada_entrega: _f, ...withoutFecha } = payload;
          const retry = await supabase.from(table).insert(withoutFecha).select().single();
          data = retry.data;
          error = retry.error;
          if (!error) {
            insertSavedWithoutFechaColumn = true;
            showToast(
              "Registro creado. La fecha estimada no se guardó hasta que agregues la columna en Supabase (scripts/add-fecha-estimada-entrega.sql).",
              "info"
            );
          }
        }
        if (error) throw error;
        setTableData((rows) => [data as Row, ...rows]);
        if (!insertSavedWithoutFechaColumn) {
          showToast("Nuevo registro creado", "success");
        }
      }
      closeModal();
    } catch (err: unknown) {
      console.error(err);
      showToast("Error al guardar: " + postgrestErrorMessage(err), "error");
    } finally {
      setSaveBusy(false);
    }
  };

  const requestDelete = (id: number) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const closeConfirm = useCallback(() => {
    setConfirmOpen(false);
    setPendingDeleteId(null);
  }, []);

  const confirmAction = async () => {
    if (pendingDeleteId === null || !currentPanel) return;
    const table = currentPanel === "retiro" ? "retiros" : "services";
    try {
      const { error } = await supabase.from(table).delete().eq("id", pendingDeleteId);
      if (error) throw error;
      setTableData((rows) => rows.filter((d) => d.id !== pendingDeleteId));
      closeConfirm();
      showToast("Registro eliminado", "info");
    } catch (err) {
      console.error(err);
      showToast("Error al eliminar", "error");
      closeConfirm();
    }
  };

  const onDropRetiro = (e: DragEvent, col: RetiroColumnId) => {
    e.preventDefault();
    setDropCol(null);
    const raw = e.dataTransfer.getData("text/plain");
    const id = Number(raw);
    if (!id || Number.isNaN(id)) return;
    const row = tableData.find((r) => r.id === id);
    if (!row || row.estado === col) return;
    void changeStatus(id, col);
  };

  const onDropService = (e: DragEvent, col: ServiceKanbanCol) => {
    e.preventDefault();
    setDropColService(null);
    const raw = e.dataTransfer.getData("text/plain");
    const id = Number(raw);
    if (!id || Number.isNaN(id)) return;
    const row = tableData.find((r) => r.id === id);
    if (!row || currentPanel !== "service") return;
    const next = serviceEstadoAfterDrop(col, row.estado);
    if (next === null) return;
    void changeStatus(id, next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmOpen) closeConfirm();
      else if (modalOpen) closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen, modalOpen, closeConfirm, closeModal]);

  const dashTitle =
    currentPanel === "retiro"
      ? "Retiro de Bicicletas"
      : currentPanel === "service"
        ? "Service de Bicicletas"
        : "Retiro";
  const addBtnText =
    currentPanel === "retiro" ? "Nuevo Retiro" : currentPanel === "service" ? "Nuevo Service" : "";

  const modalTitle =
    editingId !== null
      ? "Editar Registro"
      : currentPanel === "retiro"
        ? "Nuevo Retiro"
        : "Nuevo Service";

  return (
    <div className={`carballo-panel ${inter.variable} ${bebas.variable}`}>
      <div className="bg-grid" />

      <div id="loginScreen" className={`screen ${screen === "login" ? "active" : ""}`}>
        <div className="login-logo-wrap">
          <img src={LOGO_URL} alt="Carballo Bike Logo" />
          <span className="login-subtitle">Panel de Gestion</span>
        </div>
        <div className={`login-card ${shakeLogin ? "shake" : ""}`}>
          <h2>Iniciar Sesion</h2>
          <div className={`login-error ${loginError ? "show" : ""}`}>
            <i className="fa-solid fa-circle-exclamation" />
            <span>{loginErrorMsg}</span>
          </div>
          <div className="form-group">
            <label htmlFor="loginEmail">Email</label>
            <div className="input-wrap">
              <input
                id="loginEmail"
                type="email"
                placeholder="tu@email.com"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    document.getElementById("loginPass")?.focus();
                  }
                }}
              />
              <i className="fa-solid fa-envelope" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="loginPass">Contrasena</label>
            <div className="input-wrap">
              <input
                id="loginPass"
                type="password"
                placeholder="Ingresa tu contrasena"
                autoComplete="current-password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
              />
              <i className="fa-solid fa-lock" />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 8 }}
            disabled={loginBusy}
            onClick={handleLogin}
          >
            {loginBusy ? (
              <>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Ingresando...
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrow-right-to-bracket" /> Ingresar
              </>
            )}
          </button>
        </div>
      </div>

      <div id="selectScreen" className={`screen ${screen === "select" ? "active" : ""}`}>
        <header className="select-header">
          <div className="select-header-left">
            <img src={LOGO_URL} alt="Logo" />
            <span className="select-header-title">CARBALLO BIKE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="user-badge">
              <div className="avatar">{userInitial}</div>
              <span>{userName}</span>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              <i className="fa-solid fa-arrow-right-from-bracket" /> Salir
            </button>
          </div>
        </header>
        <div className="select-body">
          <div className="select-welcome">
            <h1>Bienvenido</h1>
            <p>Selecciona el panel con el que deseas trabajar</p>
          </div>
          <div className="panels-grid">
            <div
              className="panel-card"
              role="button"
              tabIndex={0}
              aria-label="Retiro de bicicletas"
              onClick={() => openDashboard("retiro")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openDashboard("retiro");
                }
              }}
            >
              <div className="panel-card-icon">
                <i className="fa-solid fa-hand-holding" />
              </div>
              <div>
                <h3>Retiro de Bicicletas</h3>
                <p>
                  Gestiona las bicicletas que los clientes retiran. Controla el estado de cada retiro y mantene un
                  registro actualizado.
                </p>
              </div>
              <div className="panel-card-footer">
                Ingresar al panel <i className="fa-solid fa-arrow-right" />
              </div>
            </div>
            <div
              className="panel-card"
              role="button"
              tabIndex={0}
              aria-label="Service de bicicletas"
              onClick={() => openDashboard("service")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openDashboard("service");
                }
              }}
            >
              <div className="panel-card-icon">
                <i className="fa-solid fa-wrench" />
              </div>
              <div>
                <h3>Service de Bicicletas</h3>
                <p>
                  Administra los servicios de reparacion y mantenimiento. Segui el estado desde el ingreso hasta la
                  entrega.
                </p>
              </div>
              <div className="panel-card-footer">
                Ingresar al panel <i className="fa-solid fa-arrow-right" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="dashboardScreen" className={`screen ${screen === "dashboard" ? "active" : ""}`} style={{ position: "relative" }}>
        <div className={`loading-overlay ${dashLoading ? "show" : ""}`}>
          <div className="spinner" />
        </div>
        <header className="dash-header">
          <div className="dash-header-left">
            <img src={LOGO_URL} alt="Logo" style={{ height: 30, filter: "brightness(0) invert(1)" }} />
            <div className="dash-breadcrumb">
              <span onClick={goToSelect} role="presentation">
                Paneles
              </span>
              <span className="sep">
                <i className="fa-solid fa-chevron-right" />
              </span>
              <span className="current">{dashTitle}</span>
            </div>
          </div>
          <div className="dash-header-right">
            <button type="button" className="btn btn-primary btn-sm" id="dashAddBtn" onClick={openAddModal}>
              <i className="fa-solid fa-plus" /> {addBtnText}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={goToSelect}>
              <i className="fa-solid fa-arrow-left" /> Volver
            </button>
          </div>
        </header>
        <div
          className={`dash-body ${currentPanel === "retiro" || currentPanel === "service" ? "dash-body--kanban" : ""}`}
        >
          <div className="stats-row">{statsRow}</div>
          {currentPanel === "retiro" && (
            <>
              <div className="table-controls retiro-filters">
                <div className="filter-group">
                  <label htmlFor="fechaDesde">Desde (fecha de retiro)</label>
                  <input
                    id="fechaDesde"
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label htmlFor="fechaHasta">Hasta (fecha de retiro)</label>
                  <input
                    id="fechaHasta"
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                  />
                </div>
                <div className="search-wrap" style={{ flex: "1 1 220px", maxWidth: 360 }}>
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    type="text"
                    placeholder="Buscar por cliente o bicicleta..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="retiro-kanban-wrap">
                <div className="retiro-kanban">
                  {RETIRO_COLUMN_META.map((col) => {
                    const items = retiroFiltered.filter((d) => d.estado === col.id);
                    return (
                      <div key={col.id} className={`retiro-col retiro-col--${col.id}`}>
                        <div className="retiro-col-header">
                          <span>{col.title}</span>
                          <span className="retiro-col-count">{items.length}</span>
                        </div>
                        <div
                          className={`retiro-col-body ${dropCol === col.id ? "retiro-col-drag-over" : ""}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDropCol(col.id);
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            setDropCol(null);
                          }}
                          onDrop={(e) => onDropRetiro(e, col.id)}
                        >
                          {items.length === 0 && (
                            <div className="retiro-col-empty">Arrastra pedidos aqui o sin registros en este estado</div>
                          )}
                          {items.map((item) => {
                            const bikes = getBicicletasList(item);
                            return (
                              <div
                                key={item.id}
                                draggable
                                className={`retiro-card ${draggingId === item.id ? "dragging" : ""}`}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/plain", String(item.id));
                                  e.dataTransfer.effectAllowed = "move";
                                  setDraggingId(item.id);
                                }}
                                onDragEnd={() => {
                                  setDraggingId(null);
                                  setDropCol(null);
                                }}
                              >
                                <div className="retiro-card-name">{item.cliente}</div>
                                <div className="retiro-card-meta">
                                  <div className="retiro-card-line">
                                    <i className="fa-solid fa-phone" aria-hidden />
                                    <span>{item.telefono || "—"}</span>
                                  </div>
                                  <div className="retiro-card-line retiro-card-fecha">
                                    <span className="retiro-card-fecha-label">Fecha de retiro</span>
                                    <span className="retiro-card-fecha-valor">{formatDate(item.fecha)}</span>
                                  </div>
                                </div>
                                <div className="retiro-card-bikes">
                                  <span className="retiro-card-bikes-title">Bicicletas ({bikes.length})</span>
                                  {bikes.length === 1 ? (
                                    <div>{bikes[0]}</div>
                                  ) : (
                                    <ul>
                                      {bikes.map((b, i) => (
                                        <li key={`${item.id}-b-${i}`}>{b}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div className="retiro-card-actions">
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon btn-sm"
                                    title="Editar"
                                    onClick={() => openEditModal(item.id)}
                                  >
                                    <i className="fa-solid fa-pen" />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-icon btn-sm"
                                    title="Eliminar"
                                    style={{ color: "var(--danger)" }}
                                    onClick={() => requestDelete(item.id)}
                                  >
                                    <i className="fa-solid fa-trash" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          {currentPanel === "service" && (
            <>
              <div className="table-controls retiro-filters">
                <div className="filter-group">
                  <label htmlFor="svcFechaDesde">Desde (fecha de ingreso)</label>
                  <input
                    id="svcFechaDesde"
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                  />
                </div>
                <div className="filter-group">
                  <label htmlFor="svcFechaHasta">Hasta (fecha de ingreso)</label>
                  <input
                    id="svcFechaHasta"
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                  />
                </div>
                <div className="search-wrap" style={{ flex: "1 1 220px", maxWidth: 360 }}>
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    type="text"
                    placeholder="Buscar por cliente, bicicleta o descripcion..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="retiro-kanban-wrap">
                <div className="retiro-kanban">
                  {SERVICE_KANBAN_META.map((col) => {
                    const items = serviceFiltered.filter((d) => {
                      if (col.id === "svc_ingreso") {
                        return d.estado === "ingresada" || d.estado === "diagnostico";
                      }
                      if (col.id === "svc_reparacion") return d.estado === "en_reparacion";
                      return d.estado === "listo";
                    });
                    return (
                      <div key={col.id} className={`retiro-col retiro-col--${col.semaforoClass}`}>
                        <div className="retiro-col-header">
                          <span>{col.title}</span>
                          <span className="retiro-col-count">{items.length}</span>
                        </div>
                        <div
                          className={`retiro-col-body ${dropColService === col.id ? "retiro-col-drag-over" : ""}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDropColService(col.id);
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            setDropColService(null);
                          }}
                          onDrop={(e) => onDropService(e, col.id)}
                        >
                          {items.length === 0 && (
                            <div className="retiro-col-empty">
                              Arrastra pedidos aqui o sin registros en este estado
                            </div>
                          )}
                          {items.map((item) => (
                            <div
                              key={item.id}
                              draggable
                              className={`retiro-card ${draggingId === item.id ? "dragging" : ""}`}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", String(item.id));
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingId(item.id);
                              }}
                              onDragEnd={() => {
                                setDraggingId(null);
                                setDropColService(null);
                              }}
                            >
                              <div className="retiro-card-name">{item.cliente}</div>
                              <div className="retiro-card-meta">
                                <div className="retiro-card-line">
                                  <i className="fa-solid fa-phone" aria-hidden />
                                  <span>{item.telefono || "—"}</span>
                                </div>
                                <div className="retiro-card-line retiro-card-fecha">
                                  <span className="retiro-card-fecha-label">Fecha de ingreso</span>
                                  <span className="retiro-card-fecha-valor">{formatDate(item.fecha)}</span>
                                </div>
                                {item.fecha_estimada_entrega && (
                                  <div className="retiro-card-line retiro-card-fecha">
                                    <span className="retiro-card-fecha-label">Fecha estimada de entrega</span>
                                    <span className="retiro-card-fecha-valor">
                                      {formatDate(item.fecha_estimada_entrega)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="retiro-card-bikes">
                                <span className="retiro-card-bikes-title">Bicicleta</span>
                                <div>{item.bicicleta}</div>
                              </div>
                              {item.trabajo ? (
                                <div>
                                  <span className="retiro-card-bikes-title">Descripcion del service</span>
                                  <div className="retiro-card-desc">{item.trabajo}</div>
                                </div>
                              ) : null}
                              <div className="retiro-card-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-icon btn-sm"
                                  title="Editar"
                                  onClick={() => openEditModal(item.id)}
                                >
                                  <i className="fa-solid fa-pen" />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-icon btn-sm"
                                  title="Eliminar"
                                  style={{ color: "var(--danger)" }}
                                  onClick={() => requestDelete(item.id)}
                                >
                                  <i className="fa-solid fa-trash" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className={`modal-overlay ${modalOpen ? "show" : ""}`}
        onClick={(e) => e.target === e.currentTarget && closeModal()}
        role="presentation"
      >
        <div className="modal">
          <div className="modal-header">
            <h3>{modalTitle}</h3>
            <button type="button" className="modal-close" aria-label="Cerrar" onClick={closeModal}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div className="modal-body">
            {modalOpen && currentPanel === "retiro" && (
              <>
                <div className="form-group">
                  <label htmlFor="fCliente">Cliente</label>
                  <input
                    id="fCliente"
                    type="text"
                    placeholder="Nombre del cliente"
                    value={fCliente}
                    onChange={(e) => setFCliente(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fTelefono">Telefono</label>
                  <input
                    id="fTelefono"
                    type="text"
                    placeholder="Ej: 2215551234"
                    value={fTelefono}
                    onChange={(e) => setFTelefono(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Bicicletas</label>
                  <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 8 }}>
                    Varias bicicletas para el mismo cliente: una por campo. Agrega las que necesites.
                  </p>
                  <div className="bicicleta-lines">
                    {fBicicletas.map((line, idx) => (
                      <div key={idx} className="bicicleta-line">
                        <input
                          type="text"
                          placeholder="Marca y modelo"
                          value={line}
                          onChange={(e) => {
                            const next = [...fBicicletas];
                            next[idx] = e.target.value;
                            setFBicicletas(next);
                          }}
                        />
                        {fBicicletas.length > 1 && (
                          <button
                            type="button"
                            className="btn-icon-ghost"
                            aria-label="Quitar bicicleta"
                            onClick={() => setFBicicletas(fBicicletas.filter((_, i) => i !== idx))}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => setFBicicletas([...fBicicletas, ""])}
                  >
                    + Agregar otra bicicleta
                  </button>
                </div>
                <div className="form-group">
                  <label htmlFor="fFechaRetiro">Fecha de retiro</label>
                  <input
                    id="fFechaRetiro"
                    type="date"
                    value={fFecha}
                    onChange={(e) => setFFecha(e.target.value)}
                  />
                </div>
                {editingId !== null && (
                  <div className="form-group">
                    <label htmlFor="fEstado">Estado</label>
                    <select id="fEstado" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                      <option value="pendiente">Pendiente</option>
                      <option value="listo">Listo para retirar</option>
                      <option value="entregado">Entregado</option>
                    </select>
                  </div>
                )}
              </>
            )}
            {modalOpen && currentPanel === "service" && (
              <>
                <div className="form-group">
                  <label htmlFor="fCliente">Cliente</label>
                  <input
                    id="fCliente"
                    type="text"
                    placeholder="Nombre del cliente"
                    value={fCliente}
                    onChange={(e) => setFCliente(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fTelefono">Telefono</label>
                  <input
                    id="fTelefono"
                    type="text"
                    placeholder="Ej: 2215551234"
                    value={fTelefono}
                    onChange={(e) => setFTelefono(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fBicicletaSvc">Bicicleta</label>
                  <input
                    id="fBicicletaSvc"
                    type="text"
                    placeholder="Marca y modelo"
                    value={fBicicleta}
                    onChange={(e) => setFBicicleta(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fTrabajo">Descripcion del service</label>
                  <textarea
                    id="fTrabajo"
                    placeholder="Que hay que reparar o revisar..."
                    value={fTrabajo}
                    onChange={(e) => setFTrabajo(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fFechaIngresoSvc">Fecha de ingreso</label>
                  <input
                    id="fFechaIngresoSvc"
                    type="date"
                    value={fFecha}
                    onChange={(e) => setFFecha(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="fFechaEntregaSvc">Fecha estimada de entrega</label>
                  <input
                    id="fFechaEntregaSvc"
                    type="date"
                    value={fFechaEntrega}
                    onChange={(e) => setFFechaEntrega(e.target.value)}
                  />
                </div>
                {editingId !== null && (
                  <div className="form-group">
                    <label htmlFor="fEstado">Estado</label>
                    <select id="fEstado" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                      <option value="ingresada">Ingresada</option>
                      <option value="diagnostico">En Diagnostico</option>
                      <option value="en_reparacion">En Reparacion</option>
                      <option value="listo">Lista para Entregar</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary btn-sm" onClick={closeModal}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saveBusy} onClick={saveRecord}>
              {editingId !== null ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`confirm-overlay ${confirmOpen ? "show" : ""}`}
        onClick={(e) => e.target === e.currentTarget && closeConfirm()}
        role="presentation"
      >
        <div className="confirm-box">
          <i className="fa-solid fa-triangle-exclamation" />
          <h4>Confirmar eliminacion</h4>
          <p>Este registro se eliminara permanentemente.</p>
          <div className="confirm-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={closeConfirm}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={confirmAction}>
              Eliminar
            </button>
          </div>
        </div>
      </div>

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <i
              className={`fa-solid ${
                t.type === "success" ? "fa-circle-check" : t.type === "error" ? "fa-circle-xmark" : "fa-circle-info"
              }`}
            />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
