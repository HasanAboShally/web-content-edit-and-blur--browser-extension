import {Config} from '@remotion/cli/config';

Config.setOverwriteOutput(true);
Config.setVideoImageFormat('jpeg');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setConcurrency(4);
