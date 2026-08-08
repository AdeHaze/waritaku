import sqlite3
import sys
import os

def dump_for_d1(db_path, output_path):
    print(f"Dumping {db_path} to {output_path}...")
    if not os.path.exists(db_path):
        print(f"Error: {db_path} does not exist.")
        sys.exit(1)
        
    con = sqlite3.connect(db_path)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('PRAGMA defer_foreign_keys=TRUE;\n')
        
        for line in con.iterdump():
            # Skip unsupported pragmas or transaction commands
            if line.startswith('BEGIN TRANSACTION'):
                continue
            if line.startswith('COMMIT'):
                continue
            if line.startswith('PRAGMA foreign_keys'):
                continue
            
            f.write(f"{line}\n")
            
    con.close()
    print("Dump completed.")

if __name__ == "__main__":
    db_file = 'local.db'
    out_file = 'd1_dump.sql'
    dump_for_d1(db_file, out_file)
