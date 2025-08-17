#!/usr/bin/env python3
"""
Replacement stub for compile.ps1 — minimal build+upload orchestrator.
"""
import argparse
import subprocess


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--env', default='OutdoorAP')
    p.add_argument('--comport', default='COM10')
    args = p.parse_args()
    env = args.env
    comport = args.comport
    print(f'Building environment: {env}')

    # Run PlatformIO build
    build_cmd = ['pio', 'run', '-e', env]
    print('Running:', ' '.join(build_cmd))
    ret = subprocess.run(build_cmd)
    if ret.returncode != 0:
        print('\nBuild failed (exit code {}). Aborting upload.'.format(ret.returncode))
        return ret.returncode

    # Run upload to provided COM port
    upload_cmd = ['pio', 'run', '-e', env, '-t', 'upload', '--upload-port', comport]
    print('Uploading to', comport)
    print('Running:', ' '.join(upload_cmd))
    ret2 = subprocess.run(upload_cmd)
    if ret2.returncode != 0:
        print('\nUpload failed (exit code {}).'.format(ret2.returncode))
        return ret2.returncode

    print('\nUpload completed successfully.')
    return 0

if __name__ == '__main__':
    main()
