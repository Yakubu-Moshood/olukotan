// Release builds run as a normal Windows app with no console window behind it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() { olukotan_lib::run(); }
