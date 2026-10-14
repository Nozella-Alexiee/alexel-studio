//! Info sistem: pemakaian RAM/CPU Nozel, status baterai (untuk mode hemat),
//! daftar port yang sedang listen, dan menghentikan proses.

use crate::util::{blocking, run_capture};
use serde::Serialize;
use std::collections::BTreeMap;
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

static START: OnceLock<Instant> = OnceLock::new();

pub fn mark_start() {
    START.get_or_init(Instant::now);
}

#[derive(Serialize, Clone, Debug)]
pub struct Footprint {
    /// RSS proses inti Nozel (Rust). Proses WebKit terpisah tidak ikut terhitung.
    pub core_mb: f64,
    pub cpu_percent: f64,
    pub uptime_s: u64,
}

#[tauri::command]
pub async fn system_footprint() -> Result<Footprint, String> {
    blocking(|| {
        let pid = std::process::id().to_string();
        let mut c = Command::new("ps");
        c.args(["-o", "rss=,%cpu=", "-p", &pid]);
        let r = run_capture(c, Duration::from_secs(3))?;
        let mut it = r.stdout.split_whitespace();
        let rss: f64 = it.next().and_then(|s| s.parse().ok()).ok_or("ps tidak memberi angka RSS")?;
        let cpu: f64 = it.next().and_then(|s| s.parse().ok()).unwrap_or(0.0);
        Ok(Footprint {
            core_mb: (rss / 1024.0 * 10.0).round() / 10.0,
            cpu_percent: (cpu * 10.0).round() / 10.0,
            uptime_s: START.get_or_init(Instant::now).elapsed().as_secs(),
        })
    })
    .await
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct PowerStatus {
    pub on_battery: bool,
    pub percent: Option<u8>,
    pub charging: bool,
    pub low_power_mode: bool,
}

pub fn parse_pmset(batt: &str) -> PowerStatus {
    let on_battery = batt.contains("'Battery Power'");
    let percent = batt
        .split(|c: char| c.is_whitespace() || c == ';')
        .find_map(|t| t.strip_suffix('%').and_then(|n| n.parse::<u8>().ok()));
    let charging = batt.contains("; charging;") || batt.contains("; charged;") && !on_battery;
    PowerStatus { on_battery, percent, charging, low_power_mode: false }
}

#[tauri::command]
pub async fn power_status() -> Result<PowerStatus, String> {
    blocking(|| {
        let mut c = Command::new("pmset");
        c.args(["-g", "batt"]);
        let r = run_capture(c, Duration::from_secs(3))?;
        let mut st = parse_pmset(&r.stdout);
        let mut c = Command::new("pmset");
        c.args(["-g"]);
        if let Ok(g) = run_capture(c, Duration::from_secs(3)) {
            st.low_power_mode = g
                .stdout
                .lines()
                .any(|l| l.trim_start().starts_with("lowpowermode") && l.trim_end().ends_with('1'));
        }
        Ok(st)
    })
    .await
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ListeningPort {
    pub pid: u32,
    pub process: String,
    pub port: u16,
    pub address: String,
    pub command: String,
}

/// Parse `lsof -nP -iTCP -sTCP:LISTEN -Fpcn`.
pub fn parse_lsof(out: &str) -> Vec<ListeningPort> {
    let mut res: BTreeMap<(u16, u32), ListeningPort> = BTreeMap::new();
    let (mut pid, mut name) = (0u32, String::new());
    for line in out.lines() {
        let (tag, val) = line.split_at(line.len().min(1));
        match tag {
            "p" => pid = val.parse().unwrap_or(0),
            "c" => name = val.to_string(),
            "n" => {
                if let Some((addr, port)) = val.rsplit_once(':') {
                    if let Ok(port) = port.parse::<u16>() {
                        res.entry((port, pid)).or_insert(ListeningPort {
                            pid,
                            process: name.clone(),
                            port,
                            address: addr.trim_matches(|c| c == '[' || c == ']').to_string(),
                            command: String::new(),
                        });
                    }
                }
            }
            _ => {}
        }
    }
    res.into_values().collect()
}

#[tauri::command]
pub async fn list_ports() -> Result<Vec<ListeningPort>, String> {
    blocking(|| {
        let mut c = Command::new("lsof");
        c.args(["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]);
        let r = run_capture(c, Duration::from_secs(6))?;
        let mut ports = parse_lsof(&r.stdout);
        let own = std::process::id();
        ports.retain(|p| p.pid != own);
        for p in ports.iter_mut() {
            let mut c = Command::new("ps");
            c.args(["-o", "command=", "-p", &p.pid.to_string()]);
            if let Ok(r) = run_capture(c, Duration::from_secs(2)) {
                p.command = r.stdout.trim().chars().take(300).collect();
            }
        }
        Ok(ports)
    })
    .await
}

#[tauri::command]
pub async fn kill_process(pid: u32, force: bool) -> Result<(), String> {
    blocking(move || {
        if pid <= 1 || pid == std::process::id() {
            return Err("Proses ini tidak boleh dihentikan.".into());
        }
        let mut c = Command::new("kill");
        c.arg(if force { "-KILL" } else { "-TERM" }).arg(pid.to_string());
        let r = run_capture(c, Duration::from_secs(3))?;
        if r.success {
            Ok(())
        } else {
            Err(format!("Gagal menghentikan proses {pid}: {}", r.stderr.trim()))
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pmset_battery_and_ac() {
        let b = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t76%; discharging; 4:12 remaining present: true";
        let s = parse_pmset(b);
        assert!(s.on_battery);
        assert_eq!(s.percent, Some(76));
        assert!(!s.charging);
        let a = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t90%; charging; 0:40 remaining";
        let s = parse_pmset(a);
        assert!(!s.on_battery && s.charging);
    }

    #[test]
    fn lsof_parsing_dedupes() {
        let out = "p501\ncnode\nn*:3000\nn[::1]:3000\np777\ncphp\nn127.0.0.1:8000\n";
        let p = parse_lsof(out);
        assert_eq!(p.len(), 2);
        assert_eq!(p[0].port, 3000);
        assert_eq!(p[0].process, "node");
        assert_eq!(p[1].address, "127.0.0.1");
    }

    #[test]
    fn refuses_to_kill_self() {
        let r = tauri::async_runtime::block_on(kill_process(std::process::id(), false));
        assert!(r.is_err());
    }
}
